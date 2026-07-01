/**
 * Who may trigger the paid AI actions (generate analysis, translate, chat).
 *
 * Owner decision: only an ADMIN may use AI. A non-admin cannot — the UI shows a
 * calm "admin only" state, not an error.
 *
 * NOTE (parked): a future "pro" tier would also let admin-granted non-admin
 * users in via `users.preferences.aiPro`. That grant flow is intentionally NOT
 * wired yet; to resume, add `|| user.preferences?.aiPro === true` here and build
 * the admin grant page. The dormant `aiPro` field already exists on the schema.
 */
export function canUseAI(
	user:
		| {
				isAdmin?: boolean | null;
		  }
		| null
		| undefined,
): boolean {
	return Boolean(user?.isAdmin);
}

/** Error code returned by AI routes when the caller lacks AI access, so the
 * client can show an "admin only" state instead of a generic failure. */
export const AI_ACCESS_DENIED_CODE = "ai_access_required";
