"use client";

import { Button } from "@cap/ui";
import type { Notification as APINotification } from "@cap/web-api-contract";
import { faBellSlash, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { markAllRead } from "@/actions/notifications/mark-all-read";
import {
	FilterLabels,
	Filters,
	type FilterType,
	matchNotificationFilter,
} from "../_components/Notifications/Filter";
import { NotificationItem } from "../_components/Notifications/NotificationItem";

type Props = {
	notifications: APINotification[];
	total: number;
	page: number;
	pageSize: number;
};

export const NotificationsClient = ({
	notifications,
	total,
	page,
	pageSize,
}: Props) => {
	const router = useRouter();
	const [activeFilter, setActiveFilter] = useState<FilterType>("all");

	const filtered = notifications.filter((n) =>
		matchNotificationFilter(activeFilter, n.type),
	);

	const hasUnread = notifications.some((n) => n.readAt === null);
	const totalPages = Math.ceil(total / pageSize);

	const markAllMutation = useMutation({
		mutationFn: markAllRead,
		onSuccess: () => {
			toast.success("All notifications marked as read");
			router.refresh();
		},
		onError: () => {
			toast.error("Failed to mark notifications as read");
		},
	});

	return (
		<div className="flex flex-col gap-4 p-4 mx-auto max-w-2xl w-full">
			<div className="flex justify-between items-center">
				<h1 className="text-2xl font-semibold text-gray-12">Notifications</h1>
				{hasUnread && (
					<button
						type="button"
						onClick={() => markAllMutation.mutate()}
						disabled={markAllMutation.isPending}
						className="flex gap-1.5 items-center text-[13px] text-blue-9 transition-opacity hover:opacity-70 disabled:opacity-50"
					>
						<FontAwesomeIcon icon={faCheckDouble} className="size-3" />
						Mark all as read
					</button>
				)}
			</div>

			<div className="flex gap-4 border-b border-gray-3">
				{Filters.map((filter) => (
					<button
						key={filter}
						type="button"
						onClick={() => setActiveFilter(filter)}
						className={`pb-3 text-[13px] border-b-[1.5px] transition-colors ${
							activeFilter === filter
								? "border-gray-12 text-gray-12"
								: "border-transparent text-gray-10 hover:text-gray-11"
						}`}
					>
						{FilterLabels[filter]}
					</button>
				))}
			</div>

			<div className="flex flex-col divide-y divide-gray-3 rounded-xl border border-gray-3 overflow-hidden">
				{filtered.length === 0 ? (
					<div className="flex flex-col gap-3 justify-center items-center py-16">
						<FontAwesomeIcon
							icon={faBellSlash}
							className="text-gray-10 size-10"
						/>
						<p className="text-gray-10 text-[13px]">
							No notifications
							{activeFilter !== "all" && (
								<>
									{" "}
									for{" "}
									<span className="font-medium text-gray-11">
										{FilterLabels[activeFilter]}
									</span>
								</>
							)}
						</p>
					</div>
				) : (
					filtered.map((notification) => (
						<NotificationItem
							key={notification.id}
							notification={notification}
						/>
					))
				)}
			</div>

			{totalPages > 1 && (
				<div className="flex justify-between items-center pt-2">
					<Button
						variant="white"
						size="sm"
						disabled={page <= 1}
						onClick={() => router.push(`?page=${page - 1}`)}
					>
						Previous
					</Button>
					<span className="text-[13px] text-gray-10">
						Page {page} of {totalPages}
					</span>
					<Button
						variant="white"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => router.push(`?page=${page + 1}`)}
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
};
