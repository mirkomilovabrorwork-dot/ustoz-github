import { describe, expect, it } from "vitest";
import {
	parseVTTCues,
	cuesToPlainText,
	cuesToSRT,
} from "@/app/s/[videoId]/_components/panels/TranscriptPanel";
import { toStandardWebVtt } from "@/app/s/[videoId]/_components/utils/caption-vtt";

const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.959
To bulk import **Loom** videos via CSV.`;

describe("transcript bold preservation", () => {
	it("keeps word-bold markdown in parsed cue text", () => {
		const cues = parseVTTCues(vtt);

		expect(cues).toHaveLength(1);
		expect(cues[0]?.text).toContain("**Loom**");
	});

	it("strips bold markers from plain text and SRT export while keeping the word", () => {
		const cues = parseVTTCues(vtt);

		const plainText = cuesToPlainText(cues);
		expect(plainText).toContain("Loom");
		expect(plainText).not.toContain("**");

		const srt = cuesToSRT(cues);
		expect(srt).toContain("Loom");
		expect(srt).not.toContain("**");
	});

	it("strips bold markers from standardized native-track VTT while keeping the word", () => {
		const standardVtt = toStandardWebVtt(vtt);

		expect(standardVtt).toContain("Loom");
		expect(standardVtt).not.toContain("**");
	});
});
