import { faCog } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

export const NotificationFooter = ({ onClose }: { onClose?: () => void }) => {
	return (
		<div className="flex items-center justify-between gap-3 rounded-b-xl border border-gray-5 bg-gray-3 px-4 py-3">
			<Link
				href="/dashboard/notifications"
				onClick={onClose}
				className="text-[13px] font-medium text-blue-9 transition-opacity hover:opacity-70"
			>
				View all notifications
			</Link>
			<Link
				href="/dashboard/settings/notifications"
				onClick={onClose}
				className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
			>
				<FontAwesomeIcon icon={faCog} className="text-gray-10 size-3" />
				<span>Settings</span>
			</Link>
		</div>
	);
};
