"use client";

import { buildEnv } from "@cap/env";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClickAway } from "@uidotdev/usehooks";
import clsx from "clsx";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
	cloneElement,
	type MutableRefObject,
	useRef,
	useState,
} from "react";
import { markAsRead } from "@/actions/notifications/mark-as-read";
import Notifications from "@/app/(org)/dashboard/_components/Notifications";
import { SignedImageUrl } from "@/components/SignedImageUrl";
import { useDashboardContext } from "../../Contexts";
import {
	ReferIcon,
} from "../AnimatedIcons";
import type { ReferIconHandle } from "../AnimatedIcons/Refer";
import { DashboardSearch } from "./DashboardSearch";

const Top = () => {
	const { activeSpace, anyNewNotifications } = useDashboardContext();
	const [toggleNotifications, setToggleNotifications] = useState(false);
	const bellRef = useRef<HTMLButtonElement>(null);
	const queryClient = useQueryClient();

	const pathname = usePathname();
	const params = useParams();

	const titles: Record<string, string> = {
		"/dashboard/caps": "Instructional recordings",
		"/dashboard/folder": "Instructional recordings",
		"/dashboard/shared-caps": "Shared recordings",
		"/dashboard/caps/record": "Record",
		"/dashboard/settings/organization": "Organization Settings",
		"/dashboard/settings/organization/preferences": "Organization Settings",
		"/dashboard/settings/organization/billing": "Organization Settings",
		"/dashboard/settings/organization/members": "Organization Settings",
		"/dashboard/settings/account": "Account Settings",
		"/dashboard/settings/notifications": "Notification Settings",
		"/dashboard/spaces": "Spaces",
		"/dashboard/spaces/browse": "Browse Spaces",
		"/dashboard/analytics": "Analytics",
		[`/dashboard/folder/${params.id}`]: "Caps",
		[`/dashboard/analytics/s/${params.id}`]: "Analytics: Cap video title",
		"/dashboard/developers": "Developers",
		"/dashboard/developers/apps": "Developer Apps",
		"/dashboard/developers/usage": "Developer Usage",
		"/dashboard/developers/credits": "Developer Credits",
	};

	const title = activeSpace ? activeSpace.name : titles[pathname] || "";

	const notificationsRef: MutableRefObject<HTMLDivElement> = useClickAway(
		(e) => {
			if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
				setToggleNotifications(false);
			}
		},
	);

	const markAllAsread = useMutation({
		mutationFn: () => markAsRead(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["notifications"],
			});
		},
		onError: (error) => {
			console.error("Error marking notifications as read:", error);
		},
	});

	return (
		<div
			className={clsx(
				"flex fixed z-40 justify-between items-center py-3 pr-2 pl-5 w-full md:relative mt-[60px] lg:mt-0 lg:py-[19px] lg:pl-0 lg:pr-5",
				"top-0 bg-gray-1",
			)}
		>
			<div className="flex flex-col gap-0.5 min-w-0 shrink">
				{activeSpace && <span className="text-xs text-gray-11">Space</span>}
				<div className="flex gap-1.5 items-center">
					{activeSpace && (
						<SignedImageUrl
							image={activeSpace.iconUrl}
							name={activeSpace?.name}
							letterClass="text-xs"
							className="relative flex-shrink-0 size-5"
						/>
					)}
					<p className="relative text-lg truncate text-gray-12 lg:text-2xl">
						{title}
					</p>
				</div>
			</div>
			<div className="hidden flex-1 justify-start px-6 min-w-0 lg:flex">
				<DashboardSearch />
			</div>
			<div className="flex gap-4 justify-end items-center shrink-0">
				{buildEnv.NEXT_PUBLIC_IS_CAP && <ReferButton />}
				<div className="hidden relative lg:flex">
					<button
						type="button"
						data-state={toggleNotifications ? "open" : "closed"}
						ref={bellRef}
						onClick={() => {
							if (anyNewNotifications) {
								markAllAsread.mutate();
							}
							setToggleNotifications(!toggleNotifications);
						}}
						aria-label={`Notifications${
							anyNewNotifications ? " (new notifications available)" : ""
						}`}
						aria-expanded={toggleNotifications}
						className="relative justify-center data-[state=open]:hover:bg-gray-5 items-center bg-gray-3
                rounded-full transition-colors cursor-pointer lg:flex
                hover:bg-gray-5 data-[state=open]:bg-gray-5
                focus:outline-none
                size-9"
					>
						{anyNewNotifications && (
							<div className="absolute right-0 top-1 z-10">
								<div className="relative">
									<div className="absolute inset-0 w-2 h-2 bg-red-400 rounded-full opacity-75 animate-ping" />
									<div className="relative w-2 h-2 bg-red-400 rounded-full" />
								</div>
							</div>
						)}
						<FontAwesomeIcon className="text-gray-12 size-3.5" icon={faBell} />
					</button>
					<AnimatePresence>
						{toggleNotifications && (
							<Notifications
								ref={notificationsRef}
								onClose={() => setToggleNotifications(false)}
							/>
						)}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
};

const ReferButton = () => {
	const iconRef = useRef<ReferIconHandle>(null);
	const { setReferClickedStateHandler, referClickedState } =
		useDashboardContext();

	return (
		<Link
			href="/dashboard/refer"
			className="hidden relative lg:block"
			onClick={() => {
				setReferClickedStateHandler(true);
			}}
			onMouseEnter={() => {
				iconRef.current?.startAnimation();
			}}
			onMouseLeave={() => {
				iconRef.current?.stopAnimation();
			}}
		>
			{!referClickedState && (
				<div className="absolute right-0 top-1 z-10">
					<div className="relative">
						<div className="absolute inset-0 w-2 h-2 bg-red-400 rounded-full opacity-75 animate-ping" />
						<div className="relative w-2 h-2 bg-red-400 rounded-full" />
					</div>
				</div>
			)}

			<div className="flex justify-center items-center rounded-full transition-colors cursor-pointer bg-gray-3 hover:bg-gray-5 size-9">
				{cloneElement(<ReferIcon />, {
					ref: iconRef,
					className: "text-gray-12 size-3.5",
				})}
			</div>
		</Link>
	);
};

export default Top;
