"use client";

import type { ShareLanguage } from "@cap/database/types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@cap/ui";
import { Check, Globe2, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

const LANGUAGE_LABELS: Record<ShareLanguage, string> = {
	uz: "O'zbekcha",
	ru: "Русский",
	en: "English",
};

const ALL_LANGUAGES: ShareLanguage[] = ["uz", "ru", "en"];

/**
 * Best-effort detection of the BASE content language from a sample of its text
 * (e.g. the summary overview). Lets the picker label the original by its real
 * language ("O'zbekcha") instead of a vague "Original", and avoids offering to
 * "generate" the language the video is already in. Cyrillic → ru; Uzbek-Latin
 * markers (oʻ/gʻ + common function words) → uz; otherwise → en. Defaults to uz
 * (the app's primary market) when there is no text to judge.
 */
export function detectShareLanguage(text: string | undefined | null): ShareLanguage {
	if (!text) return "uz";
	if (/[А-Яа-яЁё]/.test(text)) return "ru";
	const t = text.toLowerCase();
	const uzMarkers =
		/(o['ʻ]|g['ʻ])/.test(t) ||
		/\b(va|bu|uchun|bilan|ekan|qanday|hamda|emas|kerak|yoki|lekin|hodisa|ushbu|orqali|hisoblanadi|mumkin)\b/.test(
			t,
		);
	if (uzMarkers) return "uz";
	return "en";
}

interface LanguagePickerProps {
	baseLanguage?: ShareLanguage;
	available: ShareLanguage[];
	selected: "base" | ShareLanguage;
	onSelect: (value: "base" | ShareLanguage) => void;
	canGenerate: boolean;
	generatingLanguage: ShareLanguage | null;
	onGenerate: (language: ShareLanguage) => void;
}

export function LanguagePicker({
	baseLanguage,
	available,
	selected,
	onSelect,
	canGenerate,
	generatingLanguage,
	onGenerate,
}: LanguagePickerProps) {
	const t = useTranslations("share");

	const currentLabel =
		selected === "base"
			? baseLanguage
				? LANGUAGE_LABELS[baseLanguage]
				: t("languageOriginal")
			: LANGUAGE_LABELS[selected];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-6 bg-gray-3 px-3 text-sm font-medium text-gray-12 transition-colors hover:bg-gray-4"
				>
					<Globe2 className="size-3.5 shrink-0" />
					{currentLabel}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => onSelect("base")}>
					{selected === "base" && (
						<Check className="mr-2 size-3.5 text-gray-12" />
					)}
					<span className={selected === "base" ? "" : "ml-[22px]"}>
						{baseLanguage
							? LANGUAGE_LABELS[baseLanguage]
							: t("languageOriginal")}
					</span>
				</DropdownMenuItem>
				{ALL_LANGUAGES.map((lang) => {
					if (lang === baseLanguage) return null;
					const isAvailable = available.includes(lang);
					const isGenerating = generatingLanguage === lang;

					if (!isAvailable && !canGenerate) return null;

					if (isGenerating) {
						return (
							<DropdownMenuItem key={lang} disabled>
								<Loader2 className="mr-2 size-3.5 animate-spin text-gray-10" />
								{LANGUAGE_LABELS[lang]}
							</DropdownMenuItem>
						);
					}

					if (isAvailable) {
						return (
							<DropdownMenuItem key={lang} onClick={() => onSelect(lang)}>
								{selected === lang && (
									<Check className="mr-2 size-3.5 text-gray-12" />
								)}
								<span className={selected === lang ? "" : "ml-[22px]"}>
									{LANGUAGE_LABELS[lang]}
								</span>
							</DropdownMenuItem>
						);
					}

					return (
						<DropdownMenuItem key={lang} onClick={() => onGenerate(lang)}>
							<Plus className="mr-2 size-3.5 text-gray-10" />
							{LANGUAGE_LABELS[lang]}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
