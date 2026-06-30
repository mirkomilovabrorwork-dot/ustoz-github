import { describe, expect, it } from "vitest";
import { isTransientGeminiError } from "@/lib/gemini-retry";
import {
	buildTranscriptionPrompt,
	mergeChunkedWebVtt,
	normalizeToWebVtt,
} from "@/lib/gemini-transcribe";
import { chunkTranscript } from "@/lib/transcript-chunk";
import { parseVTT } from "@/app/s/[videoId]/_components/utils/transcript-utils";

describe("transcription prompt", () => {
	it("keeps Uzbek editing rules while requiring app-compatible WebVTT", () => {
		const prompt = buildTranscriptionPrompt();

		expect(prompt).toContain("Uzbek Latin");
		expect(prompt).toContain("STANDARD WebVTT");
		expect(prompt).toContain("<v Speaker 1>spoken text</v>");
		expect(prompt).toContain("For one-speaker recordings");
		expect(prompt).toContain("Do NOT wrap timestamps in markdown brackets");
		expect(prompt).toContain("Wrong: dedlayn. Correct: **deadline**.");
		expect(prompt).toContain("Wrong: boshqaruv paneli. Correct: **dashboard**.");
		expect(prompt).toContain("Wrong: srazu. Correct: **сразу**.");
		expect(prompt).toContain(
			"Bugun **dashboard** **deadline** bor, **сразу** qilamiz.",
		);
		expect(prompt).not.toContain("This meeting has multiple speakers");
	});
});

describe("chunked transcript merge", () => {
	it("offsets chunk timestamps and renumbers cues", () => {
		const merged = mergeChunkedWebVtt([
			{
				offsetSec: 0,
				vtt: `WEBVTT

1
00:00:01.000 --> 00:00:03.000
First chunk
`,
			},
			{
				offsetSec: 900,
				vtt: `WEBVTT

1
00:00:02.000 --> 00:00:04.500
Second chunk
`,
			},
		]);

		expect(merged).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
First chunk

2
00:15:02.000 --> 00:15:04.500
Second chunk

`);
	});
});

describe("hallucinated trailing cue guard", () => {
	it("drops cues whose start runs past the known audio duration", () => {
		// 55-second video; Gemini hallucinates a trailing cue at 01:02:20.
		const raw = `WEBVTT

00:00:01.000 --> 00:00:04.000
Real opening line.

00:00:50.000 --> 00:00:54.000
Real closing line.

01:02:20.000 --> 01:02:24.000
Hallucinated trailing cue.
`;

		const vtt = normalizeToWebVtt(raw, 55);

		expect(vtt).toContain("Real opening line.");
		expect(vtt).toContain("Real closing line.");
		expect(vtt).not.toContain("Hallucinated trailing cue.");
		expect(vtt).not.toContain("01:02:");
	});

	it("keeps legitimate end cues within the tolerance window", () => {
		const raw = `WEBVTT

00:00:01.000 --> 00:00:04.000
Opening line.

00:00:56.500 --> 00:00:58.000
Final line just past duration.
`;

		// Duration 55s; final cue starts at 56.5s, within the 5s tolerance.
		const vtt = normalizeToWebVtt(raw, 55);

		expect(vtt).toContain("Opening line.");
		expect(vtt).toContain("Final line just past duration.");
	});
});

describe("transcript chunking", () => {
	it("extracts Speaker colon labels into metadata for single-speaker chunks", () => {
		const chunks = chunkTranscript(`WEBVTT

00:00:00.000 --> 00:00:04.000
Speaker 1: Bugun dashboard flowini tekshiramiz.

00:00:04.000 --> 00:00:08.000
Speaker 1: Keyin **CRM** integratsiyani ko'ramiz.
`);

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.speaker).toBe("Speaker 1");
		expect(chunks[0]?.text).toContain("Bugun dashboard flowini tekshiramiz");
		expect(chunks[0]?.text).not.toContain("Speaker 1:");
	});

	it("preserves per-cue speaker context inside mixed-speaker chunks", () => {
		const chunks = chunkTranscript(`WEBVTT

00:00:00.000 --> 00:00:04.000
<v Speaker 1>Login bugini ko'rdingmi?</v>

00:00:04.000 --> 00:00:08.000
<v Speaker 2>Ha, **deadline**gacha tuzatamiz.</v>
`);

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.speaker).toBeNull();
		expect(chunks[0]?.text).toContain("Speaker 1: Login bugini");
		expect(chunks[0]?.text).toContain("Speaker 2: Ha, **deadline**gacha");
	});

	it("does not leak raw WebVTT voice tags when one cue contains speaker changes", () => {
		const chunks = chunkTranscript(`WEBVTT

00:00:00.000 --> 00:00:08.000
<v Speaker 1>Ko'rdingizmi?</v> <v Speaker 2>Qarang.
`);

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.speaker).toBeNull();
		expect(chunks[0]?.text).toContain("Speaker 1: Ko'rdingizmi?");
		expect(chunks[0]?.text).toContain("Speaker 2: Qarang.");
		expect(chunks[0]?.text).not.toContain("</v>");
		expect(chunks[0]?.text).not.toContain("<v");
	});
});

describe("Gemini retry classification", () => {
	it("treats transient 501 responses as retryable", () => {
		expect(isTransientGeminiError(501, "temporary backend mismatch")).toBe(true);
	});
});

describe("parseTimestampToSeconds — colon-ms form", () => {
	it("parses 00:07:540 as 7.54 s", () => {
		const raw = `WEBVTT

1
00:07:540 --> 00:09:000
Hello world
`;
		const out = normalizeToWebVtt(raw, 600);
		expect(out).toContain("Hello world");
		expect(out).toContain("00:00:07.540");
		expect(out).not.toContain("00:07:540");
	});

	it("00:00:07.540 still parses correctly", () => {
		const raw = `WEBVTT

1
00:00:07.540 --> 00:00:09.000
Standard form
`;
		const out = normalizeToWebVtt(raw, 600);
		expect(out).toContain("Standard form");
		expect(out).toContain("00:00:07.540");
	});

	it("01:02:03 still gives 3723 s", () => {
		const raw = `WEBVTT

1
01:02:03.000 --> 01:02:07.000
Long video
`;
		const out = normalizeToWebVtt(raw, 7200);
		expect(out).toContain("Long video");
		expect(out).toContain("01:02:03.000");
	});
});

describe("parseVTT — malformed VTT guard", () => {
	it("WEBVTT header does not appear as transcript text", () => {
		const vtt = "WEBVTT\n\n1\n00:00:07.540 --> 00:00:09.000\nHello world\n";
		const entries = parseVTT(vtt);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.text).toBe("Hello world");
	});

	it("timing line does not appear as transcript text when malformed", () => {
		const vtt = "WEBVTT\n\n1\n00:07:540 --> 00:09:000\nGood text\n";
		const entries = parseVTT(vtt);
		expect(entries[0]?.text).toBe("Good text");
	});

	it("stray timestamp line is not emitted as text", () => {
		const vtt = "WEBVTT\n\n1\n00:00:07.540 --> 00:00:09.000\nReal text\n00:09:000\n";
		const entries = parseVTT(vtt);
		const allText = entries.map((e) => e.text).join("\n");
		expect(allText).not.toContain("00:09:000");
	});
});
