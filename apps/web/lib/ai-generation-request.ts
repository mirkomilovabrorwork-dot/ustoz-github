import type { VideoMetadata } from "@cap/database/types";

export function requestAiGenerationAfterTranscription({
	metadata,
	requestedAt,
	requestedBy,
}: {
	metadata: VideoMetadata;
	requestedAt: string;
	requestedBy: string;
}): VideoMetadata {
	return {
		...metadata,
		aiGenerationRequestedAt: requestedAt,
		aiGenerationRequestedBy: requestedBy,
	};
}

export function shouldStartAiAfterTranscription({
	metadata,
	aiGenerationEnabled,
}: {
	metadata: VideoMetadata;
	aiGenerationEnabled: boolean;
}): boolean {
	return (
		aiGenerationEnabled ||
		(typeof metadata.aiGenerationRequestedAt === "string" &&
			metadata.aiGenerationRequestedAt.length > 0)
	);
}
