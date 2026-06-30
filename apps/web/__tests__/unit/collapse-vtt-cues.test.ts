import { describe, expect, it } from "vitest";
import { collapseRepeatedVttCues } from "@/lib/gemini-transcribe";

function cueCount(vtt: string): number {
	return vtt.split(/\r?\n/).filter((l) => l.includes("-->")).length;
}

function texts(vtt: string): string[] {
	const out: string[] = [];
	const blocks = vtt.split(/\r?\n\r?\n/);
	for (const b of blocks) {
		const lines = b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
		if (lines.length === 0 || /^WEBVTT/i.test(lines[0] ?? "")) continue;
		const ti = lines.findIndex((l) => l.includes("-->"));
		if (ti === -1) continue;
		out.push(lines.slice(ti + 1).join("\n"));
	}
	return out;
}

describe("collapseRepeatedVttCues", () => {
	it("collapses a long degenerate run (alternating speakers) to one cue", () => {
		let vtt = "WEBVTT\n\n";
		for (let i = 0; i < 50; i++) {
			const spk = i % 2 === 0 ? 1 : 2;
			const t0 = (i * 0.3).toFixed(3);
			const t1 = (i * 0.3 + 0.3).toFixed(3);
			vtt += `${i + 1}\n00:30:${t0.padStart(6, "0")} --> 00:30:${t1.padStart(6, "0")}\n<v Speaker ${spk}>Zo'r.</v>\n\n`;
		}
		const out = collapseRepeatedVttCues(vtt);
		// 50 identical (modulo speaker/case/punct) consecutive cues -> 1.
		expect(cueCount(out)).toBe(1);
	});

	it("keeps a short run (below threshold) untouched", () => {
		const vtt =
			"WEBVTT\n\n" +
			"1\n00:00:01.000 --> 00:00:02.000\n<v Speaker 1>Ha.</v>\n\n" +
			"2\n00:00:02.000 --> 00:00:03.000\n<v Speaker 2>Ha.</v>\n\n" +
			"3\n00:00:03.000 --> 00:00:04.000\n<v Speaker 1>Ha.</v>\n\n";
		const out = collapseRepeatedVttCues(vtt);
		expect(cueCount(out)).toBe(3);
	});

	it("collapses only the degenerate block, preserving surrounding real content", () => {
		let vtt = "WEBVTT\n\n";
		vtt += "1\n00:00:00.000 --> 00:00:03.000\nSalom, boshladik.\n\n";
		for (let i = 0; i < 30; i++) {
			vtt += `${i + 2}\n00:10:${String(i).padStart(2, "0")}.000 --> 00:10:${String(i).padStart(2, "0")}.300\n<v Speaker ${(i % 2) + 1}>Xo'sh.</v>\n\n`;
		}
		vtt += "99\n00:10:31.000 --> 00:10:33.000\nRahmat, sog' bo'linglar.\n\n";
		const out = collapseRepeatedVttCues(vtt);
		const t = texts(out);
		// First, one collapsed "Xo'sh.", and the real closing remain.
		expect(t[0]).toBe("Salom, boshladik.");
		expect(t[t.length - 1]).toBe("Rahmat, sog' bo'linglar.");
		expect(t.filter((x) => x.includes("Xo'sh")).length).toBe(1);
		expect(cueCount(out)).toBe(3);
	});

	it("re-indexes kept cues sequentially and keeps the WEBVTT header", () => {
		const vtt =
			"WEBVTT\n\n" +
			"7\n00:00:01.000 --> 00:00:02.000\nBir.\n\n" +
			"9\n00:00:02.000 --> 00:00:03.000\nIkki.\n\n";
		const out = collapseRepeatedVttCues(vtt);
		expect(out.startsWith("WEBVTT\n\n")).toBe(true);
		expect(out).toContain("1\n00:00:01.000 --> 00:00:02.000\nBir.");
		expect(out).toContain("2\n00:00:02.000 --> 00:00:03.000\nIkki.");
	});
});
