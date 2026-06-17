"use client";

import { Card, CardDescription, CardTitle, Switch } from "@cap/ui";
import { useState } from "react";
import { toast } from "sonner";
import { toggleDevMode } from "@/actions/toggle-dev-mode";

interface DevModeCardProps {
	isAdmin: boolean;
	initialEnabled: boolean;
}

export const DevModeCard = ({ isAdmin, initialEnabled }: DevModeCardProps) => {
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
					? "Developer mode enabled"
					: "Developer mode disabled",
			);
		} catch {
			toast.error("Failed to toggle developer mode");
		} finally {
			setPending(false);
		}
	};

	return (
		<Card className="flex flex-col gap-4">
			<div className="space-y-1">
				<CardTitle>Developer Mode</CardTitle>
				<CardDescription>
					Enable experimental glass effects and developer tools.
				</CardDescription>
			</div>
			<div className="flex justify-between items-center">
				<span className="text-sm text-gray-12">Enable developer mode</span>
				<Switch
					checked={enabled}
					onCheckedChange={handleToggle}
					disabled={pending}
				/>
			</div>
		</Card>
	);
};
