interface VttCue {
	startMs: number;
	endMs: number;
	speaker: string | null;
	text: string;
}

export interface TranscriptChunk {
	startMs: number;
	endMs: number;
	speaker: string | null;
	text: string;
	tokens: number;
}

const TARGET_TOKENS = 400;
const OVERLAP_TOKENS = 80;

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function parseTimestampMs(ts: string): number {
	const parts = ts.trim().split(":");
	if (parts.length < 3) return 0;
	const h = parts[0] ?? "0";
	const m = parts[1] ?? "0";
	const rest = parts[2] ?? "0";
	const secParts = rest.split(".");
	const s = secParts[0] ?? "0";
	const ms = secParts[1] ?? "0";
	return (
		parseInt(h, 10) * 3600000 +
		parseInt(m, 10) * 60000 +
		parseInt(s, 10) * 1000 +
		parseInt(ms.padEnd(3, "0").slice(0, 3), 10)
	);
}

function extractSpeaker(rawText: string): { speaker: string | null; text: string } {
	const speakerMatch = rawText.match(/^<v\s+([^>]+)>(.*)/);
	if (speakerMatch) {
		return {
			speaker: speakerMatch[1]?.trim() ?? null,
			text: speakerMatch[2]?.replace(/<\/v>/, "").trim() ?? rawText,
		};
	}

	const colonMatch = rawText.match(/^([^:]{1,30}):\s+(.+)$/);
	if (colonMatch) {
		return {
			speaker: colonMatch[1]?.trim() ?? null,
			text: colonMatch[2]?.trim() ?? rawText,
		};
	}

	return { speaker: null, text: rawText };
}

function parseVttCues(vttContent: string): VttCue[] {
	const cues: VttCue[] = [];
	const blocks = vttContent
		.replace(/\r\n/g, "\n")
		.split(/\n\n+/)
		.filter((b) => b.trim().length > 0);

	for (const block of blocks) {
		const lines = block.split("\n").filter((l) => l.trim().length > 0);

		let timingLineIdx = -1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i]?.includes("-->")) {
				timingLineIdx = i;
				break;
			}
		}
		if (timingLineIdx === -1) continue;

		const timingLine = lines[timingLineIdx];
		if (!timingLine) continue;
		const [startStr, endStr] = timingLine.split("-->").map((s) => s.trim());
		if (!startStr || !endStr) continue;

		const textLines = lines.slice(timingLineIdx + 1);
		const rawText = textLines.join(" ").trim();
		if (!rawText) continue;

		const { speaker, text } = extractSpeaker(rawText);

		cues.push({
			startMs: parseTimestampMs(startStr),
			endMs: parseTimestampMs(endStr),
			speaker,
			text,
		});
	}

	return cues;
}

export function chunkTranscript(vttContent: string): TranscriptChunk[] {
	const cues = parseVttCues(vttContent);
	if (cues.length === 0) return [];

	const chunks: TranscriptChunk[] = [];
	let currentCues: VttCue[] = [];
	let currentTokens = 0;

	function flushChunk() {
		if (currentCues.length === 0) return;

		const speakers = [
			...new Set(currentCues.map((c) => c.speaker).filter(Boolean)),
		];
		const text =
			speakers.length > 1
				? currentCues
						.map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text))
						.join(" ")
				: currentCues.map((c) => c.text).join(" ");

		const firstCue = currentCues[0];
		const lastCue = currentCues[currentCues.length - 1];
		if (!firstCue || !lastCue) return;

		chunks.push({
			startMs: firstCue.startMs,
			endMs: lastCue.endMs,
			speaker: speakers.length === 1 ? (speakers[0] ?? null) : null,
			text,
			tokens: estimateTokens(text),
		});
	}

	function findOverlapStart(): number {
		if (currentCues.length === 0) return 0;

		let overlapTokens = 0;
		for (let i = currentCues.length - 1; i >= 0; i--) {
			const cue = currentCues[i];
			if (!cue) continue;
			overlapTokens += estimateTokens(cue.text);
			if (overlapTokens >= OVERLAP_TOKENS) return i;
		}
		return 0;
	}

	for (const cue of cues) {
		const cueTokens = estimateTokens(cue.text);

		if (currentTokens + cueTokens > TARGET_TOKENS && currentCues.length > 0) {
			flushChunk();

			const overlapIdx = findOverlapStart();
			const overlapCues = currentCues.slice(overlapIdx);
			currentCues = [...overlapCues];
			currentTokens = overlapCues.reduce(
				(sum, c) => sum + estimateTokens(c.text),
				0,
			);
		}

		currentCues.push(cue);
		currentTokens += cueTokens;
	}

	flushChunk();

	return chunks;
}
