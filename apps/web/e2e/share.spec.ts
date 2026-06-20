import { expect, test } from "@playwright/test";

const SHARE_ID = "x1nj6750tqpnm1b";
const SHARE_URL = `/s/${SHARE_ID}`;

test.describe("Public share page", () => {
	test("share page loads and contains a video element", async ({ page }) => {
		await page.goto(SHARE_URL, { waitUntil: "domcontentloaded" });

		// Page title must contain "Cap" (the OG/document title set by the share page)
		await expect(page).toHaveTitle(/Cap/, { timeout: 30_000 });

		// A <video> element must be present — this is the core feature of the share page.
		// If the video is missing the test MUST fail.
		const video = page.locator("video").first();
		await expect(video).toBeAttached({ timeout: 30_000 });
	});

	test("share page is not a 404", async ({ page }) => {
		const response = await page.goto(SHARE_URL);
		// HTTP status must be 200 — not 404, not 500
		expect(response?.status()).toBe(200);
	});
});
