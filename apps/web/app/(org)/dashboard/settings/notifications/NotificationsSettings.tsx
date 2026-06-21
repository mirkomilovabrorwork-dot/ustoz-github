"use client";

import { Card, CardDescription, CardTitle, Switch } from "@cap/ui";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { updatePreferences } from "@/actions/notifications/update-preferences";
import { useDashboardContext } from "../../Contexts";

type NotificationPreferences = {
	pauseComments: boolean;
	pauseReplies: boolean;
	pauseViews: boolean;
	pauseReactions: boolean;
	pauseAnonViews: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
	pauseComments: false,
	pauseReplies: false,
	pauseViews: false,
	pauseReactions: false,
	pauseAnonViews: false,
};

const NOTIFICATION_TYPES: {
	key: keyof NotificationPreferences;
	title: string;
	description: string;
}[] = [
	{
		key: "pauseComments",
		title: "Comments",
		description:
			"Email and in-app alert when someone comments on one of your Caps.",
	},
	{
		key: "pauseReplies",
		title: "Replies",
		description: "In-app alert when someone replies to a comment you left.",
	},
	{
		key: "pauseViews",
		title: "Views",
		description: "Alert when a signed-in viewer watches one of your Caps.",
	},
	{
		key: "pauseAnonViews",
		title: "Anonymous views",
		description: "Alert when an anonymous viewer watches one of your Caps.",
	},
	{
		key: "pauseReactions",
		title: "Reactions",
		description: "In-app alert when someone reacts to one of your Caps.",
	},
];

export const NotificationsSettings = () => {
	const router = useRouter();
	const { userPreferences } = useDashboardContext();
	const [preferences, setPreferences] = useState<NotificationPreferences>(
		() => ({
			...DEFAULT_PREFERENCES,
			...(userPreferences?.notifications ?? {}),
		}),
	);

	const [saveError, setSaveError] = useState<string | null>(null);

	const { mutate } = useMutation({
		mutationFn: (next: NotificationPreferences) =>
			updatePreferences({ notifications: next }),
		onSuccess: () => {
			setSaveError(null);
			router.refresh();
		},
		onError: () => {
			setSaveError("Failed to save notification preferences. Please try again.");
		},
	});

	const toggle = (key: keyof NotificationPreferences) => {
		const previous = preferences;
		const next = { ...preferences, [key]: !preferences[key] };
		setPreferences(next);
		mutate(next, { onError: () => setPreferences(previous) });
	};

	return (
		<Card className="divide-y divide-gray-4">
			{saveError && (
				<div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 mb-2">
					<span>{saveError}</span>
					<button
						type="button"
						aria-label="Dismiss error"
						className="shrink-0 text-red-500 hover:text-red-700"
						onClick={() => setSaveError(null)}
					>
						<X className="size-4" />
					</button>
				</div>
			)}
			{NOTIFICATION_TYPES.map(({ key, title, description }) => (
				<div
					key={key}
					className="flex gap-4 justify-between items-center py-4 first:pt-0 last:pb-0"
				>
					<div className="space-y-1">
						<CardTitle className="text-base">{title}</CardTitle>
						<CardDescription>{description}</CardDescription>
					</div>
					<Switch
						checked={!preferences[key]}
						onCheckedChange={() => toggle(key)}
						aria-label={`${title} notifications`}
					/>
				</div>
			))}
		</Card>
	);
};
