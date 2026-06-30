"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
	ArrowLeftIcon,
	CloudUploadIcon,
	LinkIcon,
	PictureInPictureIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";


interface HowItWorksPanelProps {
	open: boolean;
	onClose: () => void;
}

export const HowItWorksPanel = ({ open, onClose }: HowItWorksPanelProps) => {
	const t = useTranslations("recorder");
	const items = [
		{
			title: t("howItWorksUploadsTitle"),
			description: t("howItWorksUploadsDesc"),
			Icon: CloudUploadIcon,
			accent: "bg-blue-3 text-blue-11 dark:bg-blue-4 dark:text-blue-10",
		},
		{
			title: t("howItWorksLinkTitle"),
			description: t("howItWorksLinkDesc"),
			Icon: LinkIcon,
			accent: "bg-green-3 text-green-11 dark:bg-green-4 dark:text-green-10",
		},
		{
			title: t("howItWorksWebcamTitle"),
			description: t("howItWorksWebcamDesc"),
			Icon: PictureInPictureIcon,
			accent: "bg-purple-3 text-purple-11 dark:bg-purple-4 dark:text-purple-10",
		},
	] as const satisfies Array<{ title: string; description: string; Icon: LucideIcon; accent: string }>;
	return (
		<AnimatePresence mode="wait">
			{open && (
				<motion.div
					key="web-recorder-how-it-works"
					initial={{ opacity: 0, y: -12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -12 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					className="absolute inset-0 z-40 flex flex-col gap-5 rounded-lg border border-gray-3 bg-gray-1 p-5 shadow-lg dark:bg-gray-2"
				>
					<div className="flex items-center justify-between">
						<button
							type="button"
							onClick={onClose}
							className="flex items-center gap-1.5 text-sm font-medium text-gray-11 transition-colors hover:text-gray-12"
						>
							<ArrowLeftIcon className="size-4" />
							{t("back")}
						</button>
						<h2 className="text-base font-semibold text-gray-12">
							{t("howItWorksTitle")}
						</h2>
						<span className="h-9 w-9" aria-hidden />
					</div>
					<div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-1">
						<div className="space-y-4">
							{items.map(
								({ title, description, Icon, accent }) => (
									<div
										key={title}
										className="rounded-xl border border-gray-4 bg-gray-2 p-4 transition-colors hover:border-gray-5 dark:bg-gray-3"
									>
										<div className="flex items-start gap-4">
											<div
												className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${accent}`}
											>
												<Icon className="size-5" aria-hidden />
											</div>
											<div className="flex-1 space-y-1.5">
												<h3 className="text-sm font-semibold text-gray-12">
													{title}
												</h3>
												<p className="text-xs leading-relaxed text-gray-11">
													{description}
												</p>
											</div>
										</div>
									</div>
								),
							)}
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
