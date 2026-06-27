"use client";
import Top from "./Navbar/Top";
import ExtensionUpdateBanner from "./ExtensionUpdateBanner";

export default function DashboardInner({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex overflow-hidden w-full flex-col flex-1 md:mt-0 mt-[126px]">
			<ExtensionUpdateBanner />
			<Top />
			<main
				className={
					"flex relative flex-col flex-1 h-full [grid-area:main] bg-gray-1"
				}
			>
				{/* Top cap: renders rounded corner and top/side borders without affecting scroller */}
				<div
					aria-hidden
					className="h-0 rounded-tl-xl border border-b-0 pointer-events-none lg:h-2 bg-gray-2 border-gray-3"
				/>
				{/* Scrolling content area shares border/background; top border removed to meet cap */}
				<div className="relative flex h-full flex-1 flex-col overflow-hidden overflow-y-auto overscroll-contain border border-t-0 border-gray-3 bg-gray-2 p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:p-8 lg:pb-8">
					<div className="flex flex-col flex-1 gap-4 min-h-fit">{children}</div>
				</div>
			</main>
		</div>
	);
}
