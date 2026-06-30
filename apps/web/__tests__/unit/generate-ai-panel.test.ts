import { describe, expect, it } from "vitest";
import { getAiAnalysisNotice } from "@/app/s/[videoId]/_components/GenerateAiPanel";

describe("getAiAnalysisNotice", () => {
	it("does not warn for short videos", () => {
		expect(getAiAnalysisNotice(10 * 60)).toBeNull();
	});

	it("warns for videos over thirty minutes", () => {
		expect(getAiAnalysisNotice(31 * 60)).toContain("extra time and budget");
	});

	it("explains chunked transcription for hour-plus videos", () => {
		expect(getAiAnalysisNotice(60 * 60)).toContain("smaller chunks");
	});
});
