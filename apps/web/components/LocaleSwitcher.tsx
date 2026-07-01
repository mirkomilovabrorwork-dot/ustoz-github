"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@cap/ui";
import { Check, Globe2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setLanguage } from "@/actions/set-language";
import type { Locale } from "@/i18n/locales";

const LANGUAGES: Array<{ locale: Locale; label: string; flag: string }> = [
	{ locale: "uz", label: "O'zbek", flag: "🇺🇿" },
	{ locale: "en", label: "English", flag: "🇬🇧" },
	{ locale: "ru", label: "Русский", flag: "🇷🇺" },
];

/**
 * Compact site-language (UI locale) switcher for prominent placements like the
 * dashboard top bar and the login page. Self-contained: reads the active locale
 * from the next-intl provider and persists the choice via `setLanguage`
 * (NEXT_LOCALE cookie + user preferences), then refreshes so the server
 * re-renders in the new language.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
	const t = useTranslations("settings");
	const activeLocale = useLocale() as Locale;
	const router = useRouter();
	const [pending, setPending] = useState(false);

	const current =
		LANGUAGES.find((l) => l.locale === activeLocale) ?? LANGUAGES[0]!;

	const handleSelect = async (locale: Locale) => {
		if (locale === activeLocale || pending) return;
		setPending(true);
		try {
			await setLanguage(locale);
			router.refresh();
		} catch {
			toast.error(t("languageChangeError"));
		} finally {
			setPending(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={pending}
					aria-label={t("languageTitle")}
					className={[
						"inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-6 bg-gray-3 px-3 text-sm font-medium text-gray-12 transition-colors hover:bg-gray-4 disabled:opacity-60",
						className ?? "",
					].join(" ")}
				>
					<Globe2 className="size-3.5 shrink-0" />
					<span>{current.flag}</span>
					<span className="hidden sm:inline">{current.label}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{LANGUAGES.map(({ locale, label, flag }) => (
					<DropdownMenuItem key={locale} onClick={() => handleSelect(locale)}>
						{locale === activeLocale ? (
							<Check className="mr-2 size-3.5 text-gray-12" />
						) : (
							<span className="mr-2 inline-block size-3.5" />
						)}
						<span className="mr-2">{flag}</span>
						<span>{label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
