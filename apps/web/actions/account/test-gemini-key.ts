"use server";

import { getCurrentUser } from "@cap/database/auth/session";

export async function testGeminiKey(
	key: string,
): Promise<{ success: true } | { success: false; error: string }> {
	const user = await getCurrentUser();
	if (!user) return { success: false, error: "Not authenticated" };

	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
				}),
			},
		);

		if (response.ok) return { success: true };

		if (response.status === 401 || response.status === 403) {
			return { success: false, error: "Invalid API key" };
		}

		return {
			success: false,
			error: `Connection failed: ${response.status}`,
		};
	} catch {
		return { success: false, error: "Connection failed: network error" };
	}
}
