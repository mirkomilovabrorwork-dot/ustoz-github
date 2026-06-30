import type { ShareLanguage } from "@cap/database/types";
import type { Video } from "@cap/web-domain";
import { useQuery } from "@tanstack/react-query";

type TranslationStatus = "PROCESSING" | "COMPLETE" | "ERROR" | null;

type AiTranslationResult = {
	status: TranslationStatus;
	hasContent: boolean;
};

export const useAiTranslation = (
	videoId: Video.VideoId,
	language: ShareLanguage | null,
	enabled: boolean,
) => {
	const query = useQuery({
		queryKey: ["ai-translation", videoId, language],
		queryFn: async (): Promise<AiTranslationResult> => {
			const res = await fetch(
				`/api/video/ai/translate?videoId=${videoId}&language=${language}`,
			);
			if (!res.ok) {
				throw new Error("AI_TRANSLATION_STATUS_FAILED");
			}
			const body = await res.json();
			return {
				status: body.status ?? null,
				hasContent: !!body.hasContent,
			};
		},
		enabled: enabled && !!language,
		refetchOnWindowFocus: false,
		refetchInterval: (query) => {
			const d = query.state.data;
			if (!d) return 4000;
			const terminal =
				d.hasContent || d.status === "COMPLETE" || d.status === "ERROR";
			return terminal ? false : 4000;
		},
		retry: 2,
		retryDelay: 1000,
	});

	const isPolling =
		enabled &&
		!!language &&
		!(
			query.data?.hasContent ||
			query.data?.status === "COMPLETE" ||
			query.data?.status === "ERROR"
		);

	return { data: query.data, isPolling };
};
