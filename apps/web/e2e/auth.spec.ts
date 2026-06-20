import { expect, test } from "@playwright/test";

test.describe("Authentication", () => {
	test("login page renders the sign-in form", async ({ page }) => {
		await page.goto("/login");

		// The heading must be visible
		await expect(
			page.getByRole("heading", { name: "Sign in to Cap" }),
		).toBeVisible();

		// Both inputs must be present
		await expect(page.getByPlaceholder("tim@apple.com")).toBeVisible();
		await expect(page.getByPlaceholder("Password")).toBeVisible();

		// Submit button must be present
		await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
	});

	test("login with valid credentials redirects to dashboard", async ({
		page,
	}) => {
		await page.goto("/login");

		await page.getByPlaceholder("tim@apple.com").fill("admin@ustoz.uz");
		await page.getByPlaceholder("Password").fill("ustoz1234");
		await page.getByRole("button", { name: "Sign in" }).click();

		// After successful login, the app redirects to /dashboard (or /dashboard/caps).
		// We wait for navigation away from /login.
		await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

		// A known dashboard element must be visible to confirm the user is logged in.
		// The page title metadata is "Instructional recordings" for /dashboard/caps.
		await expect(page).toHaveURL(/\/dashboard/);
	});

	test("login with wrong password shows error message", async ({ page }) => {
		await page.goto("/login");

		await page.getByPlaceholder("tim@apple.com").fill("admin@ustoz.uz");
		await page.getByPlaceholder("Password").fill("wrongpassword");
		await page.getByRole("button", { name: "Sign in" }).click();

		// The error must appear on the same page — no redirect
		await expect(
			page.getByText("Invalid email or password."),
		).toBeVisible({ timeout: 10_000 });

		// Must still be on /login
		await expect(page).toHaveURL(/\/login/);
	});
});
