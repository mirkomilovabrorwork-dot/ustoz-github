import { describe, expect, it } from "vitest";
import {
	DATE_SEPARATOR,
	formatPlatformDate,
	formatPlatformDateRelative,
	formatPlatformDateShort,
	formatPlatformDateTime,
} from "./date";

describe("formatPlatformDate", () => {
	it("formats a Date object", () => {
		expect(formatPlatformDate(new Date(2026, 5, 15))).toBe("15 — June, 2026");
	});

	it("formats an ISO string", () => {
		expect(formatPlatformDate("2026-01-01T00:00:00Z")).toMatch(
			/1 — January, 2026/,
		);
	});

	it("handles December", () => {
		expect(formatPlatformDate(new Date(2026, 11, 31))).toBe(
			"31 — December, 2026",
		);
	});

	it("handles leap year Feb 29", () => {
		expect(formatPlatformDate(new Date(2028, 1, 29))).toBe(
			"29 — February, 2028",
		);
	});

	it("uses the DATE_SEPARATOR constant", () => {
		expect(DATE_SEPARATOR).toBe("—");
		expect(formatPlatformDate(new Date(2026, 5, 15))).toContain(DATE_SEPARATOR);
	});

	it("returns empty string for null/undefined/invalid", () => {
		expect(formatPlatformDate(null)).toBe("");
		expect(formatPlatformDate(undefined)).toBe("");
		expect(formatPlatformDate("not-a-date")).toBe("");
	});
});

describe("formatPlatformDateTime", () => {
	it("includes time in 24h format", () => {
		const d = new Date(2026, 5, 15, 16, 21);
		expect(formatPlatformDateTime(d)).toBe("15 — June, 2026 · 16:21");
	});

	it("pads single-digit hours and minutes", () => {
		const d = new Date(2026, 0, 5, 9, 5);
		expect(formatPlatformDateTime(d)).toBe("5 — January, 2026 · 09:05");
	});

	it("returns empty string for invalid input", () => {
		expect(formatPlatformDateTime(null)).toBe("");
		expect(formatPlatformDateTime(undefined)).toBe("");
	});
});

describe("formatPlatformDateShort", () => {
	it("returns compact format for charts", () => {
		expect(formatPlatformDateShort(new Date(2026, 5, 15))).toBe("15 Jun");
	});

	it("handles all months", () => {
		expect(formatPlatformDateShort(new Date(2026, 0, 1))).toBe("1 Jan");
		expect(formatPlatformDateShort(new Date(2026, 11, 31))).toBe("31 Dec");
	});

	it("returns empty string for invalid input", () => {
		expect(formatPlatformDateShort(null)).toBe("");
		expect(formatPlatformDateShort(undefined)).toBe("");
	});
});

describe("formatPlatformDateRelative", () => {
	it("handles seconds", () => {
		const now = new Date();
		const tenSecondsAgo = new Date(now.getTime() - 10 * 1000);
		expect(formatPlatformDateRelative(tenSecondsAgo)).toBe("a few seconds ago");
	});

	it("handles minutes", () => {
		const now = new Date();
		const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
		expect(formatPlatformDateRelative(fiveMinutesAgo)).toBe("5 minutes ago");
	});

	it("handles hours", () => {
		const now = new Date();
		const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
		expect(formatPlatformDateRelative(threeHoursAgo)).toBe("3 hours ago");
	});

	it("handles days", () => {
		const now = new Date();
		const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
		expect(formatPlatformDateRelative(fiveDaysAgo)).toBe("5 days ago");
	});

	it("handles months", () => {
		const now = new Date();
		const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
		expect(formatPlatformDateRelative(twoMonthsAgo)).toMatch(/months ago/);
	});

	it("handles years", () => {
		const now = new Date();
		const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
		expect(formatPlatformDateRelative(twoYearsAgo)).toBe("2 years ago");
	});

	it("returns empty string for invalid input", () => {
		expect(formatPlatformDateRelative(null)).toBe("");
		expect(formatPlatformDateRelative(undefined)).toBe("");
	});
});
