"use client";

import { buildEnv } from "@cap/env";
import { Button } from "@cap/ui";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDashboardContext } from "@/app/(org)/dashboard/Contexts";
import { UpgradeModal } from "@/components/UpgradeModal";

export const UploadCapButton = ({
	size = "md",
	folderId,
}: {
	size?: "sm" | "lg" | "md";
	grey?: boolean;
	folderId?: string;
}) => {
	const { user } = useDashboardContext();
	const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
	const router = useRouter();

	const handleClick = () => {
		if (!user) return;

		if (!user.isPro && buildEnv.NEXT_PUBLIC_IS_CAP) {
			setUpgradeModalOpen(true);
			return;
		}

		router.push(
			folderId
				? `/dashboard/import?folderId=${encodeURIComponent(folderId)}`
				: "/dashboard/import",
		);
	};

	return (
		<>
			<Button
				onClick={handleClick}
				variant="dark"
				className="flex gap-2 items-center"
				size={size}
			>
				<FontAwesomeIcon className="size-3.5" icon={faUpload} />
				Import Video
			</Button>
			<UpgradeModal
				open={upgradeModalOpen}
				onOpenChange={setUpgradeModalOpen}
			/>
		</>
	);
};
