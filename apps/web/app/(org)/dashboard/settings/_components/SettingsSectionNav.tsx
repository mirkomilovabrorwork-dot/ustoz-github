"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Top-level Settings section tabs. Consolidates the previously-separate
 * "Organization settings" and "Access management" nav entries into one Settings
 * area with three groups (Personal / Admin+Storage / Team). Admin, Storage and
 * Team tabs are shown only to admins; Personal is for everyone.
 */
export function SettingsSectionNav({ isAdmin }: { isAdmin: boolean }) {
	const pathname = usePathname();
	const t = useTranslations("navigation");

	const tabs = [
		{
			key: "personal",
			label: t("settingsSectionPersonal"),
			href: "/dashboard/settings/account",
			match: (p: string) =>
				p.startsWith("/dashboard/settings/account") ||
				p.startsWith("/dashboard/settings/notifications"),
			adminOnly: false,
		},
		{
			key: "admin",
			label: t("settingsSectionAdmin"),
			href: "/dashboard/settings/organization",
			match: (p: string) => p.startsWith("/dashboard/settings/organization"),
			adminOnly: true,
		},
		{
			key: "storage",
			label: t("settingsSectionStorage"),
			href: "/dashboard/settings/storage",
			match: (p: string) => p.startsWith("/dashboard/settings/storage"),
			adminOnly: true,
		},
		{
			key: "team",
			label: t("settingsSectionTeam"),
			href: "/dashboard/admin/access",
			match: (p: string) => p.startsWith("/dashboard/admin/access"),
			adminOnly: true,
		},
	].filter((tab) => !tab.adminOnly || isAdmin);

	return (
		<div
			role="tablist"
			className="flex gap-4 items-center border-b border-gray-4 overflow-x-auto scrollbar-none"
		>
			{tabs.map((tab) => {
				const isActive = tab.match(pathname);
				return (
					<div key={tab.key} className="relative shrink-0">
						<Link
							href={tab.href}
							role="tab"
							aria-selected={isActive}
							className="flex relative items-center min-h-[44px] whitespace-nowrap px-0.5 cursor-pointer group"
						>
							<p
								className={clsx(
									"text-sm font-medium transition-colors",
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
								layoutId="settings-section-tab"
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
