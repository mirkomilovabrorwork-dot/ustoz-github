/**
 * Shared Gemini prompt rules — single source of truth for mixed-language
 * script preservation across ALL AI surfaces (summary, refined transcript,
 * translation; the transcription prompt mirrors these in its rule 8).
 *
 * The user-visible bug this guards against: foreign words getting
 * transliterated into the dominant language's script (Russian "любой"
 * rendered as "lyuboy", English "deadline" as "dedlayn").
 */
export const MIXED_LANGUAGE_PRESERVATION_RULES = `Mixed-language script-preservation rules (HARD requirements — violating any of these makes the whole output WRONG):
- Every word keeps its ORIGINAL script exactly as spoken/written. Russian words stay in Cyrillic: любой stays любой — writing "lyuboy" is an ERROR. English words stay in Latin: deadline stays deadline — writing "dedlayn" is an ERROR.
- NEVER transliterate between scripts in either direction: Cyrillic → Latin is forbidden, Latin → Cyrillic is forbidden.
- NEVER translate foreign/technical words into the dominant language: dashboard must NOT become "boshqaruv paneli", deadline must NOT become "muddat", сразу must NOT become "srazu".
- Technical terms, product names, brand names, code identifiers, and acronyms stay exactly as spoken.
- Ordinary prose in the dominant language may be cleaned or summarized normally (for Uzbek: in Uzbek Latin).
- Preserve existing markdown **bold** around foreign terms when present.`;
