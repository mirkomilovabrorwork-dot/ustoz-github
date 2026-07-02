/**
 * Daily per-browser (or per-user) question limit for the share-page AI chat.
 * The counter lives in the `ai_chat_usage` table keyed by
 * (videoId, clientId, dateUtc) and is incremented atomically before each
 * request; a request that pushes the count past the limit is rejected.
 */
export const DAILY_CHAT_LIMIT = 20;

/** Error code returned (HTTP 429) when the daily chat limit is exhausted. */
export const DAILY_CHAT_LIMIT_CODE = "daily_limit";

/** Cookie that identifies an anonymous browser for chat rate limiting. */
export const AI_CHAT_CLIENT_COOKIE = "ai_chat_cid";

export function isOverDailyChatLimit(count: number): boolean {
	return count > DAILY_CHAT_LIMIT;
}
