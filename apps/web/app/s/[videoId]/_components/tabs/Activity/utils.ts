import { formatPlatformDateRelative, formatPlatformDateTime } from "@cap/utils";

export const formatTimestamp = (date: Date) => formatPlatformDateTime(date);

export const formatTimeAgo = (date: Date) => formatPlatformDateRelative(date);
