"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

type TabId = "summary" | "tasks" | "transcript" | "refined";

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
	const t = useTranslations("share");
	const searchParams = useSearchParams();
	const router = useRouter();

	const TABS: { id: TabId; label: string; shortLabel: string }[] = [
		{ id: "summary", label: t("tabSummary"), shortLabel: t("tabSummaryShort") },
		{ id: "tasks", label: t("tabTasks"), shortLabel: t("tabTasksShort") },
		{
			id: "transcript",
			label: t("tabTranscript"),
			shortLabel: t("tabTranscriptShort"),
		},
		{ id: "refined", label: t("tabRefined"), shortLabel: t("tabRefinedShort") },
	];

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

	const activeContent = panels.find((p) => p.id === activeTab)?.content;

	return (
		<div className="flex flex-col w-full">
			{/* gentle fade when the active panel changes */}
			<style>{`@keyframes tabPanelFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

			{/* Tab bar — flat row, active = bottom border */}
			<div
				role="tablist"
				aria-label={t("tabsAriaLabel")}
				style={{
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
					display: "flex",
					gap: "4px",
					background: "transparent",
					borderBottom: "1px solid var(--gray-4)",
					overflowX: "auto",
					flexWrap: "nowrap",
					WebkitOverflowScrolling: "touch",
				}}
			>
				{TABS.map((tab) => {
					const isActive = activeTab === tab.id;
					const hiddenOnDesktop = hideTranscriptTab && tab.id === "transcript";
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={isActive}
							aria-controls={`panel-${tab.id}`}
							id={`tab-${tab.id}`}
							onClick={() => handleTabClick(tab.id)}
							onMouseEnter={(e) => {
								if (!isActive) e.currentTarget.style.color = "var(--gray-12)";
							}}
							onMouseLeave={(e) => {
								if (!isActive) e.currentTarget.style.color = "var(--gray-11)";
							}}
							className={hiddenOnDesktop ? "xl:!hidden" : undefined}
							style={{
								flex: "0 0 auto",
								minWidth: "74px",
								minHeight: "44px",
								padding: "9px 14px",
								marginBottom: "-1px",
								fontSize: "13px",
								fontWeight: 600,
								whiteSpace: "nowrap",
								textAlign: "center",
								cursor: "pointer",
								color: isActive ? "var(--gray-12)" : "var(--gray-11)",
								border: "none",
								borderBottom: isActive
									? "2px solid var(--blue-9)"
									: "2px solid transparent",
								borderRadius: 0,
								background: "transparent",
								boxShadow: "none",
								position: "relative",
								transition: "color 200ms ease, border-color 200ms ease",
							}}
						>
							<span className="sm:hidden">{tab.shortLabel}</span>
							<span className="hidden sm:inline">{tab.label}</span>
						</button>
					);
				})}
			</div>

			{/* Active panel only — sits flush with the tab strip */}
			<div
				className={
					hideTranscriptTab && activeTab === "transcript"
						? "xl:hidden"
						: undefined
				}
			>
				<section
					key={activeTab}
					id={`panel-${activeTab}`}
					role="tabpanel"
					aria-labelledby={`tab-${activeTab}`}
					style={{
						background: "var(--gray-1)",
						borderRadius: "0 16px 16px 16px",
						padding:
							"clamp(16px, 5vw, 24px) clamp(14px, 5vw, 24px) clamp(18px, 6vw, 28px)",
						animation: "tabPanelFade .22s ease both",
					}}
				>
					<div className="pr-10 sm:pr-0">{activeContent}</div>
					<div aria-hidden="true" className="h-24 sm:hidden" />
				</section>
			</div>
		</div>
	);
}
