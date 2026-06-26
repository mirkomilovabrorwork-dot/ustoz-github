"use client";

import { LogoBadge } from "@cap/ui";
import { useClickAway } from "@uidotdev/usehooks";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { type MutableRefObject, useState } from "react";

import { DashboardSearch } from "./DashboardSearch";
import NavItems from "./Items";

export const AdminMobileNav = () => {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const sidebarRef: MutableRefObject<HTMLDivElement> = useClickAway((event) => {
		// The user menu's "Sign Out" (and Settings/theme/etc.) render inside a
		// Radix Popover PORTAL appended to <body> — OUTSIDE this drawer's DOM. A
		// tap on such a portaled item would otherwise count as a click-away,
		// close the drawer, and unmount the button before its handler runs — the
		// "can't sign out on mobile" bug. Ignore clicks inside any Radix popper.
		const target = (event as Event)?.target as Element | null;
		if (
			target?.closest?.(
				"[data-radix-popper-content-wrapper],[data-radix-portal]",
			)
		) {
			return;
		}
		setSidebarOpen(false);
	});

	return (
		<>
			<AnimatePresence>
				{sidebarOpen ? (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0, display: "none" }}
						className="flex fixed inset-0 z-[60] lg:hidden bg-gray-1/50"
					>
						<motion.div
							ref={sidebarRef}
							initial={{ x: "100%" }}
							animate={{
								x: 0,
								transition: { duration: 0.3, bounce: 0.2, type: "spring" },
							}}
							exit={{ x: "100%" }}
							className="relative flex-1 flex flex-col ml-auto max-w-xs w-[275px] border-l border-gray-3 pt-5 pb-4 px-4 bg-gray-2 overflow-y-auto"
						>
							<div className="flex justify-end items-center mb-6 w-full rounded-full">
								<button
									type="button"
									aria-label="Close navigation menu"
									onClick={() => setSidebarOpen(false)}
									className="flex justify-center items-center rounded-full"
								>
									<X className="text-gray-12 size-7" aria-hidden="true" />
								</button>
							</div>
							<NavItems toggleMobileNav={() => setSidebarOpen(false)} />
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
			<div className="flex fixed z-[51] w-full h-16 border-b border-gray-3 bg-gray-1 lg:border-none lg:hidden">
				<div className="flex gap-3 items-center px-4 w-full h-full">
					<Link className="block flex-shrink-0" href="/dashboard">
						<LogoBadge className="block w-auto h-8" />
					</Link>
					<div className="flex-1 min-w-0">
						<DashboardSearch shortcutEnabled={false} />
					</div>
					<button
						type="button"
						aria-label="Open navigation menu"
						onClick={() => setSidebarOpen(true)}
						className="flex flex-shrink-0 justify-center items-center rounded-full min-w-[44px] min-h-[44px] text-gray-12 hover:bg-gray-3"
					>
						<Menu className="size-6" aria-hidden="true" />
					</button>
				</div>
			</div>
		</>
	);
};

export default AdminMobileNav;
