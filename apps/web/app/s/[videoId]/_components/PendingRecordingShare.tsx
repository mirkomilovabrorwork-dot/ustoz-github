"use client";

import { LogoSpinner } from "@cap/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MAX_REFRESH_ATTEMPTS = 30;
const REFRESH_INTERVAL_MS = 2000;

export function PendingRecordingShare() {
	const t = useTranslations("share");
	const router = useRouter();
	const [hasTimedOut, setHasTimedOut] = useState(false);

	useEffect(() => {
		let refreshCount = 0;
		router.refresh();

		const interval = window.setInterval(() => {
			refreshCount += 1;

			if (refreshCount >= MAX_REFRESH_ATTEMPTS) {
				setHasTimedOut(true);
				window.clearInterval(interval);
				return;
			}

			router.refresh();
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(interval);
	}, [router]);

	return (
		<div className="flex flex-col justify-center items-center p-4 min-h-screen text-center bg-gray-2">
			<LogoSpinner className="mb-6 w-10 h-auto animate-spin" />
			<h1 className="mb-2 text-2xl font-semibold text-gray-12">
				{t("pendingTitle")}
			</h1>
			<p className="max-w-md text-gray-10">
				{hasTimedOut ? t("pendingTimedOut") : t("pendingWaiting")}
			</p>
		</div>
	);
}
