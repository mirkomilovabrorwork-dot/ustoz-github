export const locales = ["uz", "en", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "uz";
