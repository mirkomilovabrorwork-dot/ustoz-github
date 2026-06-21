"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNav() {
	const pathname = usePathname();
	const tabs = [
		{ label: "General", href: "/dashboard/settings/organization" },
		{
			label: "Preferences",
			href: "/dashboard/settings/organization/preferences",
		},
		{
			label: "Integrations",
			href: "/dashboard/settings/organization/integrations",
		},
		{
			label: "Members",
			href: "/dashboard/settings/organization/members",
		},
		{
			label: "Permissions",
			href: "/dashboard/settings/organization/permissions",
		},
		{
			label: "Activity",
			href: "/dashboard/settings/organization/activity",
		},
	] as const;

	return (
		<div
			role="tablist"
			className="flex gap-4 items-center border-b border-gray-4 overflow-x-auto scrollbar-none"
		>
			{tabs.map((tab) => {
				const isActive = pathname === tab.href;

				return (
					<div key={tab.href} className="relative shrink-0">
						<Link
							href={tab.href}
							role="tab"
							aria-selected={isActive}
							className="flex relative items-center min-h-[44px] whitespace-nowrap px-0.5 cursor-pointer group"
						>
							<p
								className={clsx(
									"text-[13px] transition-colors",
									isActive
										? "text-gray-12"
										: "text-gray-10 group-hover:text-gray-11",
								)}
							>
								{tab.label}
							</p>
						</Link>
						{isActive && (
							<motion.div
								layoutId="org-settings-tab"
								className="absolute right-0 bottom-0 w-full h-px rounded-full bg-gray-12"
								transition={{ ease: "easeOut", duration: 0.2 }}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
