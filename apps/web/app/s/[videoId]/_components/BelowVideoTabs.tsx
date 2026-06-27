"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

type TabId = "summary" | "tasks" | "transcript" | "refined";

const TABS: { id: TabId; label: string; shortLabel: string }[] = [
	{ id: "summary", label: "Summary", shortLabel: "Summary" },
	{ id: "tasks", label: "Action Items", shortLabel: "Tasks" },
	{ id: "transcript", label: "Transcript", shortLabel: "Transcript" },
	{ id: "refined", label: "Clean Transcript", shortLabel: "Clean" },
];

interface BelowVideoTabsProps {
	summary?: React.ReactNode;
	tasks?: React.ReactNode;
	transcript?: React.ReactNode;
	refined?: React.ReactNode;
	/**
	 * On wide desktops (xl+) the transcript is shown in the pinned column beside
	 * the video, so the in-tab "Transcript" tab is hidden there to avoid a
	 * duplicate (and a second live TranscriptPanel). The tab stays visible below
	 * xl so phone/tablet/small-laptop users can still read the transcript.
	 */
	hideTranscriptTab?: boolean;
}

export function BelowVideoTabs({
	summary,
	tasks,
	transcript,
	refined,
	hideTranscriptTab = false,
}: BelowVideoTabsProps) {
	const searchParams = useSearchParams();
	const router = useRouter();

	const rawParam = searchParams.get("tab");
	const initialTab: TabId =
		rawParam === "tasks" ||
		rawParam === "transcript" ||
		rawParam === "refined" ||
		rawParam === "summary"
			? rawParam
			: "summary";

	const [activeTab, setActiveTab] = useState<TabId>(initialTab);

	// Click a tab → switch the visible panel instantly (Loom-style), and keep the
	// URL `?tab=` in sync for shareability. No scroll-spy, no stacked sections.
	const handleTabClick = useCallback(
		(id: TabId) => {
			setActiveTab(id);
			const params = new URLSearchParams(searchParams.toString());
			params.set("tab", id);
			router.replace(`?${params.toString()}`, { scroll: false });
		},
		[router, searchParams],
	);

	const panels: { id: TabId; content: React.ReactNode }[] = [
		{ id: "summary", content: summary },
		{ id: "tasks", content: tasks },
		{ id: "transcript", content: transcript },
		{ id: "refined", content: refined },
	];

	const activeLabel = TABS.find((t) => t.id === activeTab)?.label;
	const activeContent = panels.find((p) => p.id === activeTab)?.content;

	return (
		<div className="flex flex-col w-full">
			{/* gentle fade when the active panel changes */}
			<style>{`@keyframes tabPanelFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

			{/* Tab bar */}
			<div
				role="tablist"
				aria-label="Video details"
				style={{
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
					display: "flex",
					gap: "4px",
					padding: "8px",
					background: "linear-gradient(var(--gray-2), var(--gray-1))",
					backdropFilter: "blur(6px)",
					WebkitBackdropFilter: "blur(6px)",
					borderRadius: "16px 16px 0 0",
					borderBottom: "1px solid var(--gray-4)",
					overflowX: "auto",
					flexWrap: "nowrap",
					WebkitOverflowScrolling: "touch",
				}}
			>
				{TABS.map((tab) => {
					const isActive = activeTab === tab.id;
					const hiddenOnDesktop =
						hideTranscriptTab && tab.id === "transcript";
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={isActive}
							aria-controls={`panel-${tab.id}`}
							id={`tab-${tab.id}`}
							onClick={() => handleTabClick(tab.id)}
							className={hiddenOnDesktop ? "xl:!hidden" : undefined}
							style={{
								flex: "0 0 auto",
								minWidth: "74px",
								minHeight: "44px",
								padding: "9px 10px",
								fontSize: "13px",
								fontWeight: 600,
								whiteSpace: "nowrap",
								textAlign: "center",
								cursor: "pointer",
								color: isActive ? "var(--blue-11)" : "var(--gray-11)",
								border: "none",
								borderRadius: "9px",
								background: isActive ? "var(--blue-3)" : "none",
								boxShadow: isActive
									? "inset 0 0 0 1px rgba(37, 99, 235, .14)"
									: "none",
								position: "relative",
								transition:
									"color 320ms cubic-bezier(.22,.61,.36,1), background 320ms cubic-bezier(.22,.61,.36,1)",
							}}
						>
							<span className="sm:hidden">{tab.shortLabel}</span>
							<span className="hidden sm:inline">{tab.label}</span>
						</button>
					);
				})}
			</div>

			{/* Active panel only */}
			<div
				className={
					hideTranscriptTab && activeTab === "transcript"
						? "mt-3 xl:hidden"
						: "mt-3"
				}
			>
				<section
					key={activeTab}
					id={`panel-${activeTab}`}
					role="tabpanel"
					aria-labelledby={`tab-${activeTab}`}
					style={{
						background: "var(--gray-1)",
						border: "1px solid var(--gray-4)",
						borderRadius: "16px",
						boxShadow:
							"0 1px 2px rgba(15,23,42,.06), 0 2px 6px rgba(15,23,42,.07)",
						padding:
							"clamp(16px, 5vw, 24px) clamp(14px, 5vw, 24px) clamp(18px, 6vw, 28px)",
						animation: "tabPanelFade .22s ease both",
					}}
				>
					<h2
						style={{
							fontFamily:
								"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
							fontSize: "11px",
							fontWeight: 700,
							letterSpacing: ".07em",
							textTransform: "uppercase",
							color: "var(--gray-10)",
							marginBottom: "12px",
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
					>
						{activeLabel}
						<span
							style={{
								flex: 1,
								height: "1px",
								background: "var(--gray-4)",
								display: "block",
							}}
						/>
					</h2>
					{activeContent}
				</section>
			</div>
		</div>
	);
}
