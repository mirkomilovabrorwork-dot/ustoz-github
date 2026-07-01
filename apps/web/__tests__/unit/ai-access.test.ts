import { describe, expect, it } from "vitest";
import { AI_ACCESS_DENIED_CODE, canUseAI } from "@/lib/permissions/ai-access";

describe("canUseAI (admin-only gate)", () => {
	it("allows admins", () => {
		expect(canUseAI({ isAdmin: true })).toBe(true);
	});
	it("blocks non-admins", () => {
		expect(canUseAI({ isAdmin: false })).toBe(false);
		expect(canUseAI({})).toBe(false);
	});
	it("blocks a null/undefined user", () => {
		expect(canUseAI(null)).toBe(false);
		expect(canUseAI(undefined)).toBe(false);
	});
	it("exposes a stable denial code for the client", () => {
		expect(AI_ACCESS_DENIED_CODE).toBe("ai_access_required");
	});
});
