import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import { transcriptChunks, videos } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { and, eq, isNotNull } from "drizzle-orm";
import { Option } from "effect";
import { withCostGuard } from "@/lib/ai-cost-guard";
import { EMBED_MODEL, embedChunksWithUsage } from "@/lib/gemini-embed";
import { runPromise } from "@/lib/server";
import { chunkTranscript } from "@/lib/transcript-chunk";
import { getStorageAccessForVideo } from "@/lib/video-storage";

export async function hasTranscriptIndex(videoId: string): Promise<boolean> {
	const [indexedChunk] = await db()
		.select({ id: transcriptChunks.id })
		.from(transcriptChunks)
		.where(
			and(
				eq(transcriptChunks.videoId, Video.VideoId.make(videoId)),
				isNotNull(transcriptChunks.embedding),
			),
		)
		.limit(1);

	return Boolean(indexedChunk);
}

async function fetchTranscriptVtt(
	videoId: string,
	video: typeof videos.$inferSelect,
): Promise<string | null> {
	const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);
	const vtt = await bucket
		.getObject(`${video.ownerId}/${videoId}/transcription.vtt`)
		.pipe(runPromise);

	if (Option.isNone(vtt)) {
		return null;
	}

	return vtt.value;
}

export async function ensureTranscriptIndex({
	videoId,
	video,
	apiKey,
	userId,
}: {
	videoId: string;
	video: typeof videos.$inferSelect;
	apiKey: string;
	userId: string;
}): Promise<boolean> {
	if (await hasTranscriptIndex(videoId)) {
		return true;
	}

	const vttContent = await fetchTranscriptVtt(videoId, video);
	if (!vttContent) {
		return false;
	}

	const chunks = chunkTranscript(vttContent);
	if (chunks.length === 0) {
		return false;
	}

	const { embeddings } = await withCostGuard({
		orgId: video.orgId,
		userId,
		videoId,
		operation: "embedding",
		model: EMBED_MODEL,
		fn: async () => {
			const result = await embedChunksWithUsage(chunks, apiKey);
			return {
				embeddings: result.embeddings,
				inputTokens: result.totalTokens,
				outputTokens: 0,
			};
		},
	});

	const rows = chunks.map((chunk, i) => ({
		id: nanoId(),
		videoId: Video.VideoId.make(videoId),
		chunkIndex: i,
		startMs: chunk.startMs,
		endMs: chunk.endMs,
		speaker: chunk.speaker,
		text: chunk.text,
		tokens: chunk.tokens,
		embedding: embeddings[i] ?? null,
		embeddingModel: EMBED_MODEL,
	}));

	await db()
		.delete(transcriptChunks)
		.where(eq(transcriptChunks.videoId, Video.VideoId.make(videoId)));

	await db().insert(transcriptChunks).values(rows);

	return true;
}
