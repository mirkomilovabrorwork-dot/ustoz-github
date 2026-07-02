/**
 * Type definitions for JSON metadata fields
 */

export interface AiSummary {
	overview: string;
	topics: { title: string; body: string }[];
	nextSteps: string[];
	tasks: {
		title: string;
		assignee: string;
		priority: "high" | "medium" | "low";
		deadline: string;
		done: boolean;
	}[];
	chapters: { startSec: number; title: string; body: string }[];
	refinedTranscript: {
		chapters: { startSec: number; title: string; paragraphs: string[] }[];
	};
}

/**
 * Languages offered for on-demand multi-language analysis (ИSH 3).
 * The enum in web-domain supports 24 codes, but the share-page picker is uz/ru/en.
 */
export type ShareLanguage = "uz" | "ru" | "en";

export type TranslationStatus = "PROCESSING" | "COMPLETE" | "ERROR";

/**
 * Video metadata structure
 */
export interface VideoMetadata {
	/**
	 * Custom created date that can be edited by the user
	 * This overrides the display of the actual createdAt timestamp
	 */
	customCreatedAt?: string;
	/**
	 * Title of the captured monitor or window
	 */
	sourceName?: string;
	/**
	 * AI generated title for the video
	 */
	aiTitle?: string;
	titleManuallyEdited?: boolean;
	/**
	 * AI generated summary of the content
	 */
	summary?: string;
	/**
	 * Chapter markers generated from the transcript
	 */
	chapters?: { title: string; start: number }[];
	aiGenerationStatus?:
		| "QUEUED"
		| "PROCESSING"
		| "COMPLETE"
		| "ERROR"
		| "SKIPPED";
	aiProcessingStep?: "transcribe" | "summary" | "refined" | "done";
	aiGenerationRequestedAt?: string;
	aiGenerationRequestedBy?: string;
	aiGenerationError?: string;
	enhancedAudioStatus?: "PROCESSING" | "COMPLETE" | "ERROR" | "SKIPPED";
	isDemo?: boolean;
	aiSummary?: AiSummary | null;
	transcriptionChunksCompleted?: number;
	transcriptionChunksTotal?: number;
	/**
	 * Multi-language analysis (ИSH 3). The base `aiSummary` above is the original
	 * generation; `aiSummaryByLanguage` holds on-demand-translated cached versions.
	 * Translated caption/transcript VTT lives in R2 at
	 * `{ownerId}/{videoId}/transcription.{lang}.vtt`.
	 */
	aiBaseLanguage?: ShareLanguage;
	aiSummaryByLanguage?: Partial<Record<ShareLanguage, AiSummary>>;
	aiTranslationStatus?: Partial<Record<ShareLanguage, TranslationStatus>>;
	/** Per-video default display language, set by owner/org member. */
	preferredLanguage?: ShareLanguage;
}

export type VideoEditRange = {
	start: number;
	end: number;
};

export type VideoEditSpec = {
	version: 1;
	sourceDuration: number;
	keepRanges: VideoEditRange[];
};

/**
 * Space metadata structure
 */
export interface SpaceMetadata {
	[key: string]: never;
}

/**
 * User metadata structure
 */
export interface UserMetadata {
	[key: string]: never;
}
