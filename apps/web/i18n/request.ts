import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, type Locale, locales } from "./locales";

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value as
		| Locale
		| undefined;
	const locale =
		cookieLocale && locales.includes(cookieLocale)
			? cookieLocale
			: defaultLocale;

	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	};
});
