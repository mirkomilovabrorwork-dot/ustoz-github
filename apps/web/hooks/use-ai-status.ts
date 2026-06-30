import type { Video } from "@cap/web-domain";
import { useQuery } from "@tanstack/react-query";

export type AiGenerationStatus =
	| "QUEUED"
	| "PROCESSING"
	| "COMPLETE"
	| "ERROR"
	| "SKIPPED";

type AiStatusResult = {
	processing: boolean;
	aiGenerationStatus: AiGenerationStatus | null;
	hasContent: boolean;
};

export const useAiStatus = (videoId: Video.VideoId, enabled: boolean) => {
	return useQuery({
		queryKey: ["ai-status", videoId],
		queryFn: async (): Promise<AiStatusResult> => {
			const res = await fetch(`/api/video/ai?videoId=${videoId}`);
			if (!res.ok) {
				throw new Error("AI_STATUS_FAILED");
			}
			const body = await res.json();
			return {
				processing: !!body.processing,
				aiGenerationStatus: body.aiGenerationStatus ?? null,
				hasContent: !!(body.summary || body.chapters),
			};
		},
		enabled,
		refetchOnWindowFocus: false,
		refetchInterval: (query) => {
			const d = query.state.data;
			if (!d) return 4000;
			const terminal =
				d.hasContent ||
				d.aiGenerationStatus === "COMPLETE" ||
				d.aiGenerationStatus === "ERROR" ||
				d.aiGenerationStatus === "SKIPPED";
			return terminal ? false : 4000;
		},
		retry: 2,
		retryDelay: 1000,
	});
};
