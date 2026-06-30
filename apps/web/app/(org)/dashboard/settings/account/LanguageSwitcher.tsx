"use client";

import { Card, CardDescription, CardTitle } from "@cap/ui";
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

interface LanguageSwitcherProps {
	currentLocale: Locale;
}

export const LanguageSwitcher = ({ currentLocale }: LanguageSwitcherProps) => {
	const router = useRouter();
	const [pending, setPending] = useState<Locale | null>(null);

	const handleSelect = async (locale: Locale) => {
		if (locale === currentLocale || pending !== null) return;
		setPending(locale);
		try {
			await setLanguage(locale);
			router.refresh();
		} catch {
			toast.error("Failed to change language");
		} finally {
			setPending(null);
		}
	};

	return (
		<Card className="flex flex-col gap-4">
			<div className="space-y-1">
				<CardTitle>Language</CardTitle>
				<CardDescription>
					Choose your preferred interface language.
				</CardDescription>
			</div>
			<div className="flex flex-wrap gap-2">
				{LANGUAGES.map(({ locale, label, flag }) => {
					const isActive = locale === currentLocale;
					const isLoading = pending === locale;
					return (
						<button
							key={locale}
							type="button"
							disabled={isLoading || pending !== null}
							onClick={() => handleSelect(locale)}
							className={[
								"flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
								isActive
									? "border-gray-12 bg-gray-12 text-gray-1"
									: "border-gray-6 bg-transparent text-gray-11 hover:border-gray-9 hover:text-gray-12",
								isLoading || (pending !== null && !isActive)
									? "opacity-50 cursor-not-allowed"
									: "cursor-pointer",
							].join(" ")}
						>
							<span>{flag}</span>
							<span>{label}</span>
						</button>
					);
				})}
			</div>
		</Card>
	);
};
