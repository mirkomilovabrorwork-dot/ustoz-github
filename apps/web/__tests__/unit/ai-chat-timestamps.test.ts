import { describe, expect, it } from "vitest";
import {
	formatSeconds,
	parseTimestampToSeconds,
} from "@/app/s/[videoId]/_components/ai-chat-timestamps";

describe("parseTimestampToSeconds", () => {
	it("parses 3-digit mm:ss", () => {
		expect(parseTimestampToSeconds("111:34")).toBe(6694);
	});

	it("parses h:mm:ss", () => {
		expect(parseTimestampToSeconds("1:51:34")).toBe(6694);
	});

	it("parses 2-digit mm:ss", () => {
		expect(parseTimestampToSeconds("88:29")).toBe(5309);
	});

	it("parses zero-padded mm:ss", () => {
		expect(parseTimestampToSeconds("00:45")).toBe(45);
	});
});

describe("formatSeconds", () => {
	it("formats over an hour as h:mm:ss", () => {
		expect(formatSeconds(6694)).toBe("1:51:34");
	});

	it("formats under an hour as zero-padded mm:ss", () => {
		expect(formatSeconds(45)).toBe("00:45");
	});

	it("formats just over an hour as h:mm:ss", () => {
		expect(formatSeconds(5309)).toBe("1:28:29");
	});
});
