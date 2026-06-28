import { normalizeWebVttVoiceText } from "@/lib/transcript-vtt";

export function getActiveCaptionText(
	activeCues: TextTrackCueList | null | undefined,
): string {
	if (!activeCues?.length) {
		return "";
	}

	let selectedCue: VTTCue | null = null;
	const cueList = activeCues as TextTrackCueList & {
		item?: (index: number) => TextTrackCue | null;
	};

	for (let index = 0; index < activeCues.length; index++) {
		const cue = (cueList[index] ?? cueList.item?.(index)) as
			| VTTCue
			| null
			| undefined;
		if (cue && (!selectedCue || cue.startTime >= selectedCue.startTime)) {
			selectedCue = cue;
		}
	}

	const normalized = normalizeWebVttVoiceText(selectedCue?.text ?? "");
	return normalized.text
		.replace(/^Speaker\s*\d+:\s*/i, "")
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.trim();
}
