import { describe, expect, it } from "vitest";
import { toStandardWebVtt } from "@/app/s/[videoId]/_components/utils/caption-vtt";

// Parse "HH:MM:SS.mmm --> HH:MM:SS.mmm" lines back into [start, end] seconds.
function ranges(vtt: string): { start: number; end: number }[] {
	const toSec = (t: string) => {
		const [h, m, rest] = t.split(":");
		const [s, ms] = (rest ?? "0.000").split(".");
		return (
			parseInt(h ?? "0", 10) * 3600 +
			parseInt(m ?? "0", 10) * 60 +
			parseInt(s ?? "0", 10) +
			parseInt((ms ?? "0").padEnd(3, "0"), 10) / 1000
		);
	};
	return vtt
		.split("\n")
		.filter((l) => l.includes("-->"))
		.map((l) => {
			const [a, b] = l.split("-->");
			return { start: toSec((a ?? "").trim()), end: toSec((b ?? "").trim()) };
		});
}

describe("toStandardWebVtt runaway-end clamp", () => {
	it("clamps a runaway end on the LAST cue to start + default", () => {
		// Real-shape defect: a ~2.5min clip whose last cue ends at 2h21m.
		const raw = [
			"WEBVTT",
			"",
			"1",
			"00:00:00.000 --> 00:00:02.000",
			"Birinchi.",
			"",
			"2",
			"00:02:20.943 --> 02:21:43.000",
			"Oxirgi runaway cue.",
			"",
		].join("\n");

		const r = ranges(toStandardWebVtt(raw));
		expect(r).toHaveLength(2);
		// Last cue end must be pulled back to a sane few seconds, not 2h+.
		expect(r[1]!.end).toBeCloseTo(r[1]!.start + 3, 3);
	});

	it("clamps a runaway end on a MIDDLE cue to the next cue's start", () => {
		const raw = [
			"WEBVTT",
			"",
			"00:00:10.000 --> 00:50:00.000",
			"Runaway middle cue.",
			"",
			"00:00:15.000 --> 00:00:18.000",
			"Keyingi cue.",
			"",
		].join("\n");

		const r = ranges(toStandardWebVtt(raw));
		expect(r).toHaveLength(2);
		// 10s start, runaway 50min end -> clamped to next start (15s).
		expect(r[0]!.end).toBeCloseTo(15, 3);
	});

	it("leaves normal-length cues untouched", () => {
		const raw = [
			"WEBVTT",
			"",
			"00:00:00.000 --> 00:00:05.000",
			"Oddiy cue.",
			"",
			"00:00:05.000 --> 00:00:09.500",
			"Yana oddiy.",
			"",
		].join("\n");

		const r = ranges(toStandardWebVtt(raw));
		expect(r).toHaveLength(2);
		expect(r[0]!.end).toBeCloseTo(5, 3);
		expect(r[1]!.end).toBeCloseTo(9.5, 3);
	});
});
