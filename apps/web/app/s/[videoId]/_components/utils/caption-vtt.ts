/**
 * caption-vtt.ts
 *
 * Converts any VTT-like string (including Gemini's non-standard output) into
 * strict standard WebVTT that every browser's native parser accepts.
 *
 * Handled input shapes:
 *   - Standard multi-line:  HH:MM:SS.mmm --> HH:MM:SS.mmm\ntext
 *   - Inline cue:           **[start --> end]** text
 *   - Bracket cue:          [start --> end] text
 *   - Colon-ms timestamp:   MM:SS:mmm  (e.g. 00:07:540 = 7.540 s)
 *   - Comma decimal:        HH:MM:SS,mmm
 *   - Short timestamp:      MM:SS (no hours)
 *   - Single timestamp:     **[HH:MM:SS]** text  (no end -> start+3s)
 *
 * Output: strict "WEBVTT\n\n" header then blocks:
 *   HH:MM:SS.mmm --> HH:MM:SS.mmm\n<plain text>\n\n
 *
 * Dependencies: none (ASCII only).
 */

interface ParsedCue {
  start: number;
  end: number | null;
  text: string;
}

// Matches any timestamp we accept (same grammar as gemini-transcribe.ts).
// Colon-ms alternative (:\d{3}\b) must come before the :\d{1,2} branch to
// prevent the two-digit-seconds group from eating a three-digit ms group.
const TS = "\\d{1,2}:\\d{1,2}(?::\\d{3}\\b|:\\d{1,2})?(?:[.,]\\d{1,3})?";

const INLINE_RANGE = new RegExp(
  `^[\\s*\\[-]*?(${TS})\\s*-->\\s*(${TS})\\s*\\]?\\*?\\*?\\s*(.*)$`,
);
const RANGE_LINE = new RegExp(`(${TS})\\s*-->\\s*(${TS})`);
const SINGLE_STAMP = new RegExp(`^[\\s*\\[-]*?(${TS})\\s*\\]?\\*?\\*?\\s*(.*)$`);

function parseTimestamp(raw: string): number | null {
  const t = raw.trim();

  // Colon-ms form: HH:MM:SS:mmm or MM:SS:mmm
  const colonMs = t.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}):(\d{3})$/);
  if (colonMs) {
    const h = colonMs[1] ? parseInt(colonMs[1], 10) : 0;
    const m = parseInt(colonMs[2] ?? "0", 10);
    const s = parseInt(colonMs[3] ?? "0", 10);
    const ms = parseInt(colonMs[4] ?? "0", 10);
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  // Standard form: [HH:]MM:SS[.mmm] or [HH:]MM:SS[,mmm]
  const std = t.match(
    /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/,
  );
  if (!std) return null;
  const h = std[1] ? parseInt(std[1], 10) : 0;
  const m = parseInt(std[2] ?? "0", 10);
  const s = parseInt(std[3] ?? "0", 10);
  const ms = std[4] ? parseInt(std[4].padEnd(3, "0"), 10) : 0;
  return h * 3600 + m * 60 + s + ms / 1000;
}

function formatTs(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "." +
    String(ms).padStart(3, "0")
  );
}

function stripMarkdown(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/^[\s\-–—>]+/, "")
    .trim();
}

// WebVTT cue settings (align:, line:, etc.) are not transcript text.
const CUE_SETTING = /^(?:align|line|position|size|vertical|region):\S+$/i;
function stripCueSettings(text: string): string {
  return text
    .split(/\s+/)
    .filter((tok) => tok && !CUE_SETTING.test(tok))
    .join(" ")
    .trim();
}

/**
 * Parse any VTT-like string into an array of normalized cues.
 */
function parseCues(raw: string): ParsedCue[] {
  const lines = raw.split(/\r?\n/);
  const cues: ParsedCue[] = [];

  let pendingStart: number | null = null;
  let pendingEnd: number | null = null;
  let pendingText: string[] = [];

  const flush = () => {
    if (pendingStart !== null) {
      const text = stripMarkdown(pendingText.join(" "));
      if (text) cues.push({ start: pendingStart, end: pendingEnd, text });
    }
    pendingStart = null;
    pendingEnd = null;
    pendingText = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();

    if (!line) {
      flush();
      continue;
    }

    // Skip WEBVTT header
    if (/^WEBVTT/i.test(line)) continue;

    // Skip bare cue-index numbers (only when next non-empty line is a timestamp)
    if (/^\d+$/.test(line)) {
      let nextNonEmpty = "";
      for (let j = i + 1; j < lines.length; j++) {
        const peek = (lines[j] ?? "").trim();
        if (peek) { nextNonEmpty = peek; break; }
      }
      if (nextNonEmpty.includes("-->")) continue;
      // else treat as cue text (fall through)
    }

    if (line.includes("-->")) {
      flush();

      // Try inline cue first: timestamps + text on same line
      const im = line.match(INLINE_RANGE);
      if (im) {
        const start = parseTimestamp(im[1] ?? "");
        const end = parseTimestamp(im[2] ?? "");
        const text = stripCueSettings(stripMarkdown(im[3] ?? ""));
        if (start !== null) {
          if (text) {
            cues.push({ start, end, text });
          } else {
            // No inline text — next line(s) have the body
            pendingStart = start;
            pendingEnd = end;
          }
          continue;
        }
      }

      // Standard range line — text on following line(s)
      const rm = line.match(RANGE_LINE);
      if (rm) {
        const start = parseTimestamp(rm[1] ?? "");
        if (start !== null) {
          pendingStart = start;
          pendingEnd = parseTimestamp(rm[2] ?? "");
        }
      }
      continue;
    }

    // Single-timestamp cue: **[HH:MM:SS]** text  (no -->)
    const sm = line.match(SINGLE_STAMP);
    if (
      sm &&
      parseTimestamp(sm[1] ?? "") !== null &&
      (sm[2] ?? "").trim()
    ) {
      flush();
      const start = parseTimestamp(sm[1] ?? "");
      if (start !== null) {
        cues.push({ start, end: null, text: stripMarkdown(sm[2] ?? "") });
        continue;
      }
    }

    // Plain text line — accumulate as body of pending cue
    if (pendingStart !== null) {
      pendingText.push(line);
    }
  }

  flush();
  return cues;
}

const DEFAULT_CUE_DURATION = 3;

/**
 * Convert any VTT-like string to strict standard WebVTT.
 *
 * If the input is already standard WebVTT and produces cues, the output is a
 * re-serialized clean version. If no cues are found the input is returned
 * unchanged so the browser can attempt its own parse (better than an empty
 * WEBVTT header that guarantees no cues).
 */
export function toStandardWebVtt(raw: string): string {
  const cues = parseCues(raw);
  if (cues.length === 0) {
    // Nothing recognized — return raw so the browser has a chance.
    return raw;
  }

  // Monotonic-repair: some Gemini VTTs contain tail cues whose start time
  // regresses (e.g. a cue mistakenly written at 60s when it should be 600s),
  // which the browser never activates. Re-anchor any backwards cue so the
  // sequence stays monotonically increasing without reordering or dropping cues.
  let maxStart = 0;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) continue;
    if (cue.start < maxStart) {
      const prev = i > 0 ? cues[i - 1] : null;
      const newStart = prev?.end ?? (prev ? prev.start + 0.001 : maxStart);
      const duration = cue.end !== null ? cue.end - cue.start : DEFAULT_CUE_DURATION;
      cue.start = newStart;
      cue.end = newStart + duration;
    }
    if (cue.start > maxStart) maxStart = cue.start;
  }

  let out = "WEBVTT\n\n";
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) continue;
    let end = cue.end;
    if (end === null || end <= cue.start) {
      const next = cues[i + 1];
      end =
        next && next.start > cue.start
          ? next.start
          : cue.start + DEFAULT_CUE_DURATION;
    }
    out += `${formatTs(cue.start)} --> ${formatTs(end)}\n${cue.text}\n\n`;
  }
  return out;
}
