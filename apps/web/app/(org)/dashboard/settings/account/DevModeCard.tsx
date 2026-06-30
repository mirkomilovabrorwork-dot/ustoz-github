"use client";

import { Card, CardDescription, CardTitle, Switch } from "@cap/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { toggleDevMode } from "@/actions/toggle-dev-mode";

interface DevModeCardProps {
	isAdmin: boolean;
	initialEnabled: boolean;
}

export const DevModeCard = ({ isAdmin, initialEnabled }: DevModeCardProps) => {
	const t = useTranslations("settings");
	const [enabled, setEnabled] = useState(initialEnabled);
	const [pending, setPending] = useState(false);

	if (!isAdmin) return null;

	const handleToggle = async () => {
		setPending(true);
		try {
			const result = await toggleDevMode();
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			setEnabled(result.devModeEnabled);
			toast.success(
				result.devModeEnabled
					? t("devModeEnabled")
					: t("devModeDisabled"),
			);
		} catch {
			toast.error(t("devModeToggleError"));
		} finally {
			setPending(false);
		}
	};

	return (
		<Card className="flex flex-col gap-4">
			<div className="space-y-1">
				<CardTitle>{t("devMode")}</CardTitle>
				<CardDescription>
					{t("devModeDescription")}
				</CardDescription>
			</div>
			<div className="flex justify-between items-center">
				<span className="text-sm text-gray-12">{t("devModeToggleLabel")}</span>
				<Switch
					checked={enabled}
					onCheckedChange={handleToggle}
					disabled={pending}
				/>
			</div>
		</Card>
	);
};
