import { describe, expect, it } from "vitest";
import {
	collapseRepeatedCues,
	formatTimeMinutes,
} from "@/app/s/[videoId]/_components/utils/transcript-utils";

describe("collapseRepeatedCues", () => {
	it("collapses a long run of identical cues to a single cue", () => {
		const cues = Array.from({ length: 50 }, () => ({ text: "Zo'r." }));
		const result = collapseRepeatedCues(cues, (c) => c.text);
		expect(result).toHaveLength(1);
	});

	it("leaves a run below the threshold unchanged", () => {
		const cues = [{ text: "Zo'r." }, { text: "Zo'r." }, { text: "Zo'r." }];
		const result = collapseRepeatedCues(cues, (c) => c.text);
		expect(result).toHaveLength(3);
	});

	it("collapses only the degenerate run in a mixed array", () => {
		const cues = [
			{ text: "A" },
			{ text: "A" },
			{ text: "A" },
			{ text: "A" },
			{ text: "B" },
			{ text: "C" },
			{ text: "C" },
		];
		const result = collapseRepeatedCues(cues, (c) => c.text);
		expect(result.map((c) => c.text)).toEqual(["A", "B", "C", "C"]);
	});

	it("normalizes text (case, markdown bold, trailing punctuation) before comparing", () => {
		const cues = [
			{ text: "Zo'r." },
			{ text: "zo'r" },
			{ text: "**Zo'r**." },
			{ text: "Zo'r" },
			{ text: "ZO'R." },
		];
		const result = collapseRepeatedCues(cues, (c) => c.text);
		expect(result).toHaveLength(1);
		expect(result[0]?.text).toBe("Zo'r.");
	});
});

describe("formatTimeMinutes", () => {
	it("formats sub-hour durations as MM:SS", () => {
		expect(formatTimeMinutes(125)).toBe("02:05");
	});

	it("formats durations >= 1 hour as H:MM:SS", () => {
		expect(formatTimeMinutes(7191)).toBe("1:59:51");
	});
});
