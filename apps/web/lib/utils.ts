import { formatPlatformDate } from "@cap/utils";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function formatDate(dateString: string): string {
	return formatPlatformDate(dateString);
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
