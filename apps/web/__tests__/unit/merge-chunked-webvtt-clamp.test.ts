import { describe, expect, it } from "vitest";
import { mergeChunkedWebVtt } from "@/lib/gemini-transcribe";

function parseCues(vtt: string): Array<{ start: number; end: number }> {
	const tc = (t: string): number => {
		const m = t.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/);
		if (!m) return 0;
		return (
			(m[1] ? Number(m[1]) : 0) * 3600 +
			Number(m[2]) * 60 +
			Number(m[3]) +
			Number(m[4]) / 1000
		);
	};
	const out: Array<{ start: number; end: number }> = [];
	for (const line of vtt.split(/\r?\n/)) {
		if (line.includes("-->")) {
			const [a, b] = line.split("-->");
			out.push({ start: tc(a ?? ""), end: tc(b ?? "") });
		}
	}
	return out;
}

describe("mergeChunkedWebVtt — runaway-end clamp", () => {
	it("clamps a cue that ends 60 min later so it can't freeze the caption", () => {
		// The real 2h-video bug: a cue at 15:59 ending at 75:00 (runaway) stayed
		// active for an hour, freezing the on-screen caption + masking a gap.
		const chunkVtt =
			"WEBVTT\n\n00:00:59.000 --> 01:15:00.000\n<v Speaker 2>Yo'q, o'zi shunaqa deb</v>\n\n" +
			"00:01:05.000 --> 00:01:08.000\nnext line\n";
		const merged = mergeChunkedWebVtt([{ vtt: chunkVtt, offsetSec: 900 }]);
		const cues = parseCues(merged);
		const runaway = cues.find((c) => Math.abs(c.start - 959) < 1);
		expect(runaway).toBeTruthy();
		// End must be pulled back — never span more than ~30s (or to the next cue).
		expect((runaway as { end: number }).end - 959).toBeLessThanOrEqual(30.1);
	});

	it("leaves normal cues untouched and applies chunk offset", () => {
		const chunkVtt =
			"WEBVTT\n\n00:00:10.000 --> 00:00:13.000\nhello\n\n00:00:20.000 --> 00:00:23.000\nworld\n";
		const merged = mergeChunkedWebVtt([{ vtt: chunkVtt, offsetSec: 100 }]);
		const cues = parseCues(merged);
		expect(cues[0]).toEqual({ start: 110, end: 113 });
		expect(cues[1]?.start).toBe(120);
	});
});
