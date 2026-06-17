import { db } from "@cap/database";
import { decrypt } from "@cap/database/crypto";
import { nanoId } from "@cap/database/helpers";
import { aiUsageEvents, users, videos } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { priceForMicros } from "@cap/utils";
import { type Organisation, type User, Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { EMBED_MODEL, embedChunksWithUsage } from "@/lib/gemini-embed";
import { retrieveTopK } from "@/lib/transcript-retrieve";

export const dynamic = "force-dynamic";

function msToTimestamp(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

	const typedMessages = messages as Array<{
		role: "user" | "assistant";
		content: string;
	}>;

	const lastUserMessage = [...typedMessages]
		.reverse()
		.find((m) => m.role === "user");

	if (!lastUserMessage) {
		return new Response(JSON.stringify({ error: "No user message found" }), {
			status: 400,
		});
	}

	const [video] = await db()
		.select({ ownerId: videos.ownerId, orgId: videos.orgId })
		.from(videos)
		.where(eq(videos.id, Video.VideoId.make(videoId)))
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

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();

			const send = (data: string) => {
				controller.enqueue(enc.encode(`data: ${data}\n\n`));
			};

			try {
				const billingMonth = (() => {
					const now = new Date();
					return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
				})();

				const embedResult = await embedChunksWithUsage(
					[{ text: lastUserMessage.content }],
					resolvedApiKey,
				);
				const queryEmbedding = embedResult.embeddings[0];

				const embedCost = priceForMicros(
					EMBED_MODEL,
					embedResult.totalTokens,
					0,
				);
				db()
					.insert(aiUsageEvents)
					.values({
						id: nanoId(),
						orgId: video.orgId as Organisation.OrganisationId,
						userId: video.ownerId as User.UserId,
						videoId: videoId as Video.VideoId,
						operation: "chat",
						model: EMBED_MODEL,
						inputTokens: embedResult.totalTokens,
						outputTokens: 0,
						costUsdMicros: embedCost,
						billingMonth,
					})
					.catch(() => {});

				if (!queryEmbedding) {
					send(JSON.stringify({ error: "Failed to embed query" }));
					controller.close();
					return;
				}

				const chunks = await retrieveTopK(videoId, queryEmbedding, 5);

				const contextLines = chunks
					.map((c) => {
						const ts = msToTimestamp(c.startMs);
						const speaker = c.speaker ? `${c.speaker}: ` : "";
						return `[${ts}] ${speaker}${c.text}`;
					})
					.join("\n");

				const geminiMessages = [
					{
						role: "user",
						parts: [
							{
								text: `Transcript context:\n${contextLines}\n\nAnswer questions about this meeting recording using ONLY the provided transcript context. Cite timestamps as [mm:ss]. The content may be in Uzbek, Russian, or English — respond in the same language as the user's question.`,
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
					...typedMessages.map((m) => ({
						role: m.role === "user" ? "user" : "model",
						parts: [{ text: m.content }],
					})),
				];

				const geminiRes = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${resolvedApiKey}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							system_instruction: {
								parts: [
									{
										text: "You answer questions about a meeting recording. Use ONLY the provided transcript context. Cite timestamps as [mm:ss]. The content may be in Uzbek, Russian, or English — respond in the same language.",
									},
								],
							},
							contents: geminiMessages,
							generationConfig: {
								temperature: 0.2,
								maxOutputTokens: 1024,
							},
						}),
					},
				);

				if (!geminiRes.ok || !geminiRes.body) {
					const errText = await geminiRes
						.text()
						.catch(() => String(geminiRes.status));
					send(JSON.stringify({ error: `Gemini error: ${errText}` }));
					send("[DONE]");
					controller.close();
					return;
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

				const chatCost = priceForMicros(
					"gemini-2.0-flash",
					chatInputTokens,
					chatOutputTokens,
				);
				db()
					.insert(aiUsageEvents)
					.values({
						id: nanoId(),
						orgId: video.orgId as Organisation.OrganisationId,
						userId: video.ownerId as User.UserId,
						videoId: videoId as Video.VideoId,
						operation: "chat",
						model: "gemini-2.0-flash",
						inputTokens: chatInputTokens,
						outputTokens: chatOutputTokens,
						costUsdMicros: chatCost,
						billingMonth,
					})
					.catch(() => {});

				send("[DONE]");
				controller.close();
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
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
