import type { organizations, videos } from "@cap/database/schema";

export const isTranscriptionDisabled = (
	videoSettings: (typeof videos.$inferSelect)["settings"],
	orgSettings: (typeof organizations.$inferSelect)["settings"],
): boolean =>
	videoSettings?.disableTranscript ?? orgSettings?.disableTranscript ?? false;
