"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
	const initialTab: TabId =
		rawParam === "tasks" ||
		rawParam === "transcript" ||
		rawParam === "refined" ||
		rawParam === "summary"
			? rawParam
			: "summary";

	const [activeTab, setActiveTab] = useState<TabId>(initialTab);

	const sectionRefs = useRef<Partial<Record<TabId, HTMLElement | null>>>({});

	// Scroll-spy: highlight the tab whose section is most visible
	useEffect(() => {
		const observers: IntersectionObserver[] = [];

		TABS.forEach(({ id }) => {
			const el = sectionRefs.current[id];
			if (!el) return;

			const observer = new IntersectionObserver(
				(entries) => {
					const entry = entries[0];
					if (entry?.isIntersecting) {
						setActiveTab(id);
					}
				},
				{ threshold: 0.4 },
			);

			observer.observe(el);
			observers.push(observer);
		});

		return () => {
			observers.forEach((o) => o.disconnect());
		};
	}, []);

	const handleTabClick = useCallback(
		(id: TabId) => {
			// Update URL param for shareability
			const params = new URLSearchParams(searchParams.toString());
			params.set("tab", id);
			router.replace(`?${params.toString()}`, { scroll: false });

			// Smooth-scroll to the section
			const el = sectionRefs.current[id];
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		},
		[router, searchParams],
	);

	// On initial load, scroll to the tab indicated by the URL param
	useEffect(() => {
		if (initialTab !== "summary") {
			const el = sectionRefs.current[initialTab];
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		}
		// Only run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const panels: { id: TabId; content: React.ReactNode }[] = [
		{ id: "summary", content: summary },
		{ id: "tasks", content: tasks },
		{ id: "transcript", content: transcript },
		{ id: "refined", content: refined },
	];

	return (
		<div className="flex flex-col w-full">
			{/* Sticky tab bar */}
			<div
				className="sticky top-0 z-10 border-b border-gray-200"
				style={{
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
					display: "flex",
					gap: "4px",
					padding: "8px",
					background: "rgba(255,255,255,0.95)",
					backdropFilter: "blur(6px)",
					WebkitBackdropFilter: "blur(6px)",
					borderRadius: "16px 16px 0 0",
				}}
			>
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => handleTabClick(tab.id)}
						style={{
							flex: 1,
							padding: "9px 8px",
							fontSize: "13.5px",
							fontWeight: 600,
							textAlign: "center",
							cursor: "pointer",
							color: activeTab === tab.id ? "#2563eb" : "#475569",
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

			{/* Stacked panels */}
			<div className="flex flex-col gap-6 mt-3">
				{panels.map(({ id, content }) => (
					<section
						key={id}
						id={`panel-${id}`}
						ref={(el) => {
							sectionRefs.current[id] = el;
						}}
						className="bg-white border border-gray-200 rounded-xl shadow-sm p-5"
					>
						<h2
							className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3"
							style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
						>
							{TABS.find((t) => t.id === id)?.label}
						</h2>
						{content}
					</section>
				))}
			</div>
		</div>
	);
}
