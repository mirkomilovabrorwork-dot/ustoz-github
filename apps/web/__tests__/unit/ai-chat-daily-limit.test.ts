import { describe, expect, it } from "vitest";
import {
	DAILY_CHAT_LIMIT,
	isOverDailyChatLimit,
} from "@/lib/ai-chat-limit";

describe("isOverDailyChatLimit", () => {
	it("is not over the limit for counts 0 through 20", () => {
		for (let count = 0; count <= DAILY_CHAT_LIMIT; count++) {
			expect(isOverDailyChatLimit(count)).toBe(false);
		}
	});

	it("is not over the limit exactly at the boundary (20)", () => {
		expect(isOverDailyChatLimit(20)).toBe(false);
	});

	it("is over the limit once count exceeds 20", () => {
		expect(isOverDailyChatLimit(21)).toBe(true);
		expect(isOverDailyChatLimit(22)).toBe(true);
	});
});
