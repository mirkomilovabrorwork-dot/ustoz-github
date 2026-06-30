"use client";

import { Button } from "@cap/ui";
import CogIcon from "@/app/(org)/dashboard/_components/AnimatedIcons/Cog";
import { useTranslations } from "next-intl";

interface SettingsButtonProps {
	visible: boolean;
	onClick: () => void;
}

export const SettingsButton = ({ visible, onClick }: SettingsButtonProps) => {
	const t = useTranslations("recorder");
	if (!visible) return null;

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			aria-label={t("openSettings")}
			className="absolute right-16 top-3 z-20 !p-0 h-11 w-11"
			onClick={onClick}
		>
			<CogIcon size={20} aria-hidden className="text-gray-12" />
		</Button>
	);
};
