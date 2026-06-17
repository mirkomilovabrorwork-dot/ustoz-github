"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type TabId = "summary" | "tasks" | "transcript" | "refined";

const TABS: { id: TabId; label: string }[] = [
	{ id: "summary", label: "Summary" },
	{ id: "tasks", label: "Tasks" },
	{ id: "transcript", label: "Transcript" },
	{ id: "refined", label: "Refined" },
];

interface BelowVideoTabsProps {
	summary?: React.ReactNode;
	tasks?: React.ReactNode;
	transcript?: React.ReactNode;
	refined?: React.ReactNode;
}

export function BelowVideoTabs({
	summary,
	tasks,
	transcript,
	refined,
}: BelowVideoTabsProps) {
	const searchParams = useSearchParams();
	const router = useRouter();

	const rawParam = searchParams.get("tab");
	const activeTab: TabId =
		rawParam === "tasks" ||
		rawParam === "transcript" ||
		rawParam === "refined" ||
		rawParam === "summary"
			? rawParam
			: "summary";

	const handleTabChange = useCallback(
		(id: TabId) => {
			const params = new URLSearchParams(searchParams.toString());
			params.set("tab", id);
			router.push(`?${params.toString()}`, { scroll: false });
		},
		[router, searchParams],
	);

	const panels: Record<TabId, React.ReactNode> = {
		summary,
		tasks,
		transcript,
		refined,
	};

	return (
		<div className="flex flex-col w-full">
			<div
				style={{
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
					display: "flex",
					gap: "4px",
					padding: "8px",
					borderBottom: "1px solid #e9edf3",
					background: "linear-gradient(#f7f9fc, #ffffff)",
					borderRadius: "16px 16px 0 0",
				}}
			>
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => handleTabChange(tab.id)}
						style={{
							flex: 1,
							padding: "9px 8px",
							fontSize: "13.5px",
							fontWeight: 600,
							textAlign: "center",
							cursor: "pointer",
							color: activeTab === tab.id ? "#1d4ed8" : "#475569",
							border: "none",
							borderRadius: "9px",
							background: activeTab === tab.id ? "#eef4ff" : "none",
							boxShadow:
								activeTab === tab.id
									? "inset 0 0 0 1px rgba(37, 99, 235, .14)"
									: "none",
							position: "relative",
							transition:
								"color 320ms cubic-bezier(.22,.61,.36,1), background 320ms cubic-bezier(.22,.61,.36,1)",
						}}
					>
						{tab.label}
					</button>
				))}
			</div>

			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={activeTab}
					className="bv-panel mt-3"
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
				>
					{panels[activeTab]}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
