import { db } from "@cap/database";
import { decrypt } from "@cap/database/crypto";
import { getCurrentUser } from "@cap/database/auth/session";
import { users, videos } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { provideOptionalAuth, VideosPolicy } from "@cap/web-backend";
import { Policy, Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { NextRequest } from "next/server";
import { BudgetExceededError, withCostGuard } from "@/lib/ai-cost-guard";
import { EMBED_MODEL, embedChunksWithUsage } from "@/lib/gemini-embed";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { runPromise } from "@/lib/server";
import { ensureTranscriptIndex } from "@/lib/transcript-index";
import { retrieveTopK } from "@/lib/transcript-retrieve";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const MAX_MESSAGES = 20;
const RETRIEVAL_K = 10;
const requestCounts = new Map<string, { count: number; resetAt: number }>();
let rateLimitRequestCounter = 0;

function msToTimestamp(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const seconds = totalSeconds % 60;
	if (totalSeconds >= 3600) {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isRateLimited(key: string) {
	const now = Date.now();
	rateLimitRequestCounter++;
	if (rateLimitRequestCounter % 100 === 0) {
		for (const [k, v] of requestCounts) {
			if (now > v.resetAt) requestCounts.delete(k);
		}
		if (requestCounts.size > RATE_LIMIT_MAX_ENTRIES) {
			requestCounts.clear();
		}
	}

	const entry = requestCounts.get(key);
	if (!entry || now > entry.resetAt) {
		requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
		return false;
	}

	entry.count++;
	return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function buildVideoOverviewContext(
	metadata: typeof videos.$inferSelect.metadata,
): string {
	const summary =
		typeof metadata?.aiSummary?.overview === "string" &&
		metadata.aiSummary.overview.trim()
			? metadata.aiSummary.overview.trim()
			: typeof metadata?.summary === "string" && metadata.summary.trim()
				? metadata.summary.trim()
				: "";

	const chapters =
		metadata?.aiSummary?.chapters && metadata.aiSummary.chapters.length > 0
			? metadata.aiSummary.chapters.map((chapter) => ({
					title: chapter.title,
					startMs: chapter.startSec * 1000,
				}))
			: (metadata?.chapters ?? []).map((chapter) => ({
					title: chapter.title,
					startMs: chapter.start * 1000,
				}));

	const parts: string[] = [];

	if (summary) {
		parts.push(`Summary:\n${summary}`);
	}

	if (chapters.length > 0) {
		parts.push(
			`Chapter titles:\n${chapters
				.map((chapter) => `${msToTimestamp(chapter.startMs)} - ${chapter.title}`)
				.join("\n")}`,
		);
	}

	return parts.join("\n\n");
}

export async function POST(request: NextRequest) {
	let body: { videoId?: unknown; messages?: unknown };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON" }), {
			status: 400,
		});
	}

	const { videoId, messages } = body;

	if (
		typeof videoId !== "string" ||
		!videoId ||
		!Array.isArray(messages) ||
		messages.length === 0
	) {
		return new Response(
			JSON.stringify({ error: "videoId and messages are required" }),
			{ status: 400 },
		);
	}

	const user = await getCurrentUser();
	if (!user?.id) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
		});
	}

	const typedMessages = messages as Array<{
		role: "user" | "assistant";
		content: string;
	}>;
	const boundedMessages = typedMessages.slice(-MAX_MESSAGES);

	const lastUserMessage = [...typedMessages]
		.reverse()
		.find((m) => m.role === "user");

	if (!lastUserMessage) {
		return new Response(JSON.stringify({ error: "No user message found" }), {
			status: 400,
		});
	}

	const ip =
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown";
	if (isRateLimited(`${videoId}:${ip}`)) {
		return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
			status: 429,
		});
	}

	const canView = await Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;
		return yield* Effect.succeed(true).pipe(
			Policy.withPublicPolicy(
				videosPolicy.canView(Video.VideoId.make(videoId)),
			),
		);
	}).pipe(
		Effect.catchAll(() => Effect.succeed(false)),
		provideOptionalAuth,
		runPromise,
	);

	if (!canView) {
		return new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
		});
	}

	const [video] = await db()
		.select()
		.from(videos)
		.where(
			and(
				eq(videos.id, Video.VideoId.make(videoId)),
				isNull(videos.deletedAt),
			),
		)
		.limit(1);

	if (!video) {
		return new Response(JSON.stringify({ error: "Video not found" }), {
			status: 404,
		});
	}

	const [owner] = await db()
		.select({ geminiApiKey: users.geminiApiKey })
		.from(users)
		.where(eq(users.id, video.ownerId))
		.limit(1);

	let apiKey: string | undefined;

	if (owner?.geminiApiKey) {
		try {
			apiKey = await decrypt(owner.geminiApiKey);
		} catch {
			apiKey = undefined;
		}
	}

	if (!apiKey) {
		apiKey = serverEnv().GEMINI_API_KEY;
	}

	if (!apiKey) {
		return new Response(
			JSON.stringify({ error: "No Gemini API key configured" }),
			{ status: 500 },
		);
	}

	const resolvedApiKey = apiKey;
	const videoOverviewContext = buildVideoOverviewContext(video.metadata);

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();

			const send = (data: string) => {
				controller.enqueue(enc.encode(`data: ${data}\n\n`));
			};

			try {
				const indexReady = await ensureTranscriptIndex({
					videoId,
					video,
					apiKey: resolvedApiKey,
					userId: video.ownerId,
				});

				if (!indexReady) {
					send(
						JSON.stringify({
							error:
								"Transcript index is not ready because the transcript is missing or empty.",
						}),
					);
					send("[DONE]");
					controller.close();
					return;
				}

				const embedResult = await withCostGuard({
					orgId: video.orgId,
					userId: video.ownerId,
					videoId,
					operation: "embedding",
					model: EMBED_MODEL,
					fn: async () => {
						const result = await embedChunksWithUsage(
							[{ text: lastUserMessage.content }],
							resolvedApiKey,
						);
						return {
							...result,
							inputTokens: result.totalTokens,
							outputTokens: 0,
						};
					},
				});
				const queryEmbedding = embedResult.embeddings[0];

				if (!queryEmbedding) {
					send(JSON.stringify({ error: "Failed to embed query" }));
					controller.close();
					return;
				}

				const chunks = await retrieveTopK(videoId, queryEmbedding, RETRIEVAL_K);

				const contextLines = chunks
					.map((c) => {
						const ts = msToTimestamp(c.startMs);
						const speaker = c.speaker ? `${c.speaker}: ` : "";
						return `[${ts}] ${speaker}${c.text}`;
					})
					.join("\n");
				const promptContext = [
					videoOverviewContext
						? `Video overview context:\n${videoOverviewContext}`
						: "",
					`Transcript context:\n${contextLines}`,
				]
					.filter(Boolean)
					.join("\n\n");

				const geminiMessages = [
					{
						role: "user",
						parts: [
							{
								text: `${promptContext}\n\nAnswer questions about this meeting recording using ONLY the provided context. Use the overview only to understand broad questions, and cite timestamps exactly as they appear in the context, e.g. [mm:ss] or [h:mm:ss] for recordings over an hour, from transcript lines. Give a thorough, well-structured answer. For broad questions (e.g. "main lessons", "summary", "key takeaways"), synthesize across the ENTIRE recording using the overview, the chapter titles, and the transcript context together — cover the major points in order and cite SEVERAL timestamps spanning the whole video, not just the opening. Be specific and detailed; never reply with a single vague sentence when the context supports more. The content may be in Uzbek, Russian, or English — respond in the same language as the user's question.`,
							},
						],
					},
					{
						role: "model",
						parts: [
							{
								text: "Understood. I will answer questions about this meeting recording using only the provided transcript context and cite timestamps as [mm:ss].",
							},
						],
					},
					...boundedMessages.map((m) => ({
						role: m.role === "user" ? "user" : "model",
						parts: [{ text: m.content }],
					})),
				];

				await withCostGuard({
					orgId: video.orgId,
					userId: video.ownerId,
					videoId,
					operation: "chat",
					model: "gemini-2.5-flash",
					recordUsageBestEffort: true,
					fn: async () => {
				// Retry the initial connect on transient Gemini errors
				// (429/500/503/overloaded), matching summary/transcription.
				const geminiRes = await withGeminiRetry(async () => {
					const res = await fetch(
						`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${resolvedApiKey}`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								system_instruction: {
									parts: [
										{
											text: "You answer questions about a meeting recording. Use ONLY the provided context. Use the overview for broad questions, and cite timestamps exactly as they appear in the context, e.g. [mm:ss] or [h:mm:ss] for recordings over an hour, from transcript lines. Give a thorough, well-structured answer. For broad questions (e.g. \"main lessons\", \"summary\", \"key takeaways\"), synthesize across the ENTIRE recording using the overview, the chapter titles, and the transcript context together — cover the major points in order and cite SEVERAL timestamps spanning the whole video, not just the opening. Be specific and detailed; never reply with a single vague sentence when the context supports more. The content may be in Uzbek, Russian, or English — respond in the same language.",
										},
									],
								},
								contents: geminiMessages,
								generationConfig: {
									temperature: 0.2,
									maxOutputTokens: 2048,
									thinkingConfig: { thinkingBudget: 0 },
								},
							}),
						},
					);

					if (!res.ok) {
						const errText = await res
							.text()
							.catch(() => String(res.status));
						// Include the HTTP status so withGeminiRetry's transient
						// detection (429/500/503) matches even when the body text
						// doesn't name the code.
						throw new Error(
							`Gemini error (HTTP ${res.status}): ${errText}`,
						);
					}

					return res;
				});

				if (!geminiRes.body) {
					send(
						JSON.stringify({ error: "Gemini error: empty response body" }),
					);
					return { inputTokens: 0, outputTokens: 0 };
				}

				const reader = geminiRes.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				let chatInputTokens = 0;
				let chatOutputTokens = 0;

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						const raw = line.slice(6).trim();
						if (raw === "[DONE]") continue;
						try {
							const parsed = JSON.parse(raw) as {
								candidates?: Array<{
									content?: { parts?: Array<{ text?: string }> };
								}>;
								usageMetadata?: {
									promptTokenCount?: number;
									candidatesTokenCount?: number;
								};
							};
							const token =
								parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
							if (token) {
								send(JSON.stringify({ token }));
							}
							if (parsed.usageMetadata) {
								chatInputTokens =
									parsed.usageMetadata.promptTokenCount ?? chatInputTokens;
								chatOutputTokens =
									parsed.usageMetadata.candidatesTokenCount ?? chatOutputTokens;
							}
						} catch {
							// malformed SSE chunk — skip
						}
					}
				}

				return {
					inputTokens: chatInputTokens,
					outputTokens: chatOutputTokens,
				};
					},
				});

				send("[DONE]");
				controller.close();
			} catch (err) {
				const message =
					err instanceof BudgetExceededError
						? "AI budget exceeded"
						: err instanceof Error
							? err.message
							: "Unknown error";
				send(JSON.stringify({ error: message }));
				send("[DONE]");
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
