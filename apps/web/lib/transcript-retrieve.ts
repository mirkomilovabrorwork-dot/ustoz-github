import { db } from "@cap/database";
import { transcriptChunks } from "@cap/database/schema";
import { eq } from "drizzle-orm";

interface RetrievedChunk {
	startMs: number;
	endMs: number;
	speaker: string | null;
	text: string;
	score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		dot += ai * bi;
		magA += ai * ai;
		magB += bi * bi;
	}
	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	if (denom === 0) return 0;
	return dot / denom;
}

export async function retrieveTopK(
	videoId: string,
	queryEmbedding: number[],
	k = 5,
): Promise<RetrievedChunk[]> {
	const chunks = await db()
		.select({
			startMs: transcriptChunks.startMs,
			endMs: transcriptChunks.endMs,
			speaker: transcriptChunks.speaker,
			text: transcriptChunks.text,
			embedding: transcriptChunks.embedding,
		})
		.from(transcriptChunks)
		.where(eq(transcriptChunks.videoId, videoId));

	const scored = chunks
		.filter((c) => c.embedding !== null)
		.map((c) => ({
			startMs: c.startMs,
			endMs: c.endMs,
			speaker: c.speaker,
			text: c.text,
			score: cosineSimilarity(queryEmbedding, c.embedding as number[]),
		}));

	scored.sort((a, b) => b.score - a.score);

	return scored.slice(0, k);
}
