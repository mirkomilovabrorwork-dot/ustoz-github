"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@cap/ui";
import GB from "country-flag-icons/react/3x2/GB";
import RU from "country-flag-icons/react/3x2/RU";
import UZ from "country-flag-icons/react/3x2/UZ";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { setLanguage } from "@/actions/set-language";
import type { Locale } from "@/i18n/locales";

// `code` is the SHORT UI label shown next to the flag (kept separate from the
// internal `locale` — e.g. locale "en" shows as "eng"). Real SVG flags are used
// (not emoji) because emoji flags don't render on Windows/Chrome — they fall
// back to plain letters ("UZ"/"GB"), which is exactly the bug we're fixing.
const LANGUAGES: Array<{
	locale: Locale;
	code: string;
	Flag: ComponentType<{ className?: string }>;
}> = [
	{ locale: "uz", code: "uz", Flag: UZ },
	{ locale: "en", code: "eng", Flag: GB },
	{ locale: "ru", code: "ru", Flag: RU },
];

function Flag({
	Component,
}: {
	Component: ComponentType<{ className?: string }>;
}) {
	return (
		<span className="inline-block h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px]">
			<Component className="block h-full w-full object-cover" />
		</span>
	);
}

/**
 * Compact site-language (UI locale) switcher for prominent placements like the
 * dashboard top bar and the login page. Self-contained: reads the active locale
 * from the next-intl provider and persists the choice via `setLanguage`
 * (NEXT_LOCALE cookie + user preferences), then refreshes so the server
 * re-renders in the new language. Shows a real flag image + short code only.
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
					<Flag Component={current.Flag} />
					<span>{current.code}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{LANGUAGES.map(({ locale, code, Flag: LangFlag }) => (
					<DropdownMenuItem key={locale} onClick={() => handleSelect(locale)}>
						{locale === activeLocale ? (
							<Check className="mr-2 size-3.5 text-gray-12" />
						) : (
							<span className="mr-2 inline-block size-3.5" />
						)}
						<Flag Component={LangFlag} />
						<span className="ml-2">{code}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
