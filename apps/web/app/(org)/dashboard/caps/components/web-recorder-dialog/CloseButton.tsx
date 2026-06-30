"use client";

import { Button } from "@cap/ui";
import { XIcon } from "lucide-react";

interface CloseButtonProps {
	onClick: () => void;
}

export const CloseButton = ({ onClick }: CloseButtonProps) => {
	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			aria-label="Close recorder"
			className="absolute right-3 top-3 z-20 !p-0 h-11 w-11"
			onClick={onClick}
		>
			<XIcon size={20} aria-hidden className="text-gray-12" />
		</Button>
	);
};
