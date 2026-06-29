import { describe, expect, it, vi } from "vitest";

vi.mock("@cap/database", () => ({
	db: vi.fn(),
}));

vi.mock("@cap/database/helpers", () => ({
	nanoId: vi.fn(() => "usage-id"),
}));

vi.mock("@cap/database/schema", () => ({
	aiUsageEvents: {},
	organizations: {},
	users: {},
}));

vi.mock("@cap/utils", () => ({
	priceForMicros: vi.fn(() => 100),
}));

vi.mock("@cap/web-domain", () => ({
	Organisation: { OrganisationId: { make: (value: string) => value } },
	User: { UserId: { make: (value: string) => value } },
	Video: { VideoId: { make: (value: string) => value } },
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
	sql: vi.fn(() => "sql"),
}));

import {
	hasBudgetBeenReached,
	previousSpendBeforeRecordedEvent,
} from "@/lib/ai-cost-guard";

describe("AI cost guard helpers", () => {
	it("blocks only when a positive budget cap has been reached", () => {
		expect(hasBudgetBeenReached({ currentMicros: 100, capMicros: 100 })).toBe(
			true,
		);
		expect(hasBudgetBeenReached({ currentMicros: 99, capMicros: 100 })).toBe(
			false,
		);
		expect(hasBudgetBeenReached({ currentMicros: 100, capMicros: null })).toBe(
			false,
		);
		expect(hasBudgetBeenReached({ currentMicros: 100, capMicros: 0 })).toBe(
			false,
		);
	});

	it("recovers previous spend after the current event is already recorded", () => {
		expect(
			previousSpendBeforeRecordedEvent({
				currentSpendMicros: 1_500,
				eventCostMicros: 500,
			}),
		).toBe(1_000);

		expect(
			previousSpendBeforeRecordedEvent({
				currentSpendMicros: 100,
				eventCostMicros: 500,
			}),
		).toBe(0);
	});
});
