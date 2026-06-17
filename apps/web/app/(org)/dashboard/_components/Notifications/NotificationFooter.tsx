import {
	faArrowDown,
	faArrowUp,
	faCog,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

export const NotificationFooter = ({ onClose }: { onClose?: () => void }) => {
	return (
		<div className="flex flex-col rounded-b-xl border bg-gray-4 border-gray-5">
			<Link
				href="/dashboard/notifications"
				className="px-6 py-2.5 text-center text-[13px] text-blue-9 border-b border-gray-5 transition-opacity hover:opacity-70"
			>
				View all notifications
			</Link>
			<div className="flex justify-between items-center px-6 py-3">
				<div className="flex gap-2 items-center">
					<p className="text-[13px] text-gray-10">Navigate</p>
					<div className="flex gap-1 justify-center items-center rounded-md size-4 bg-gray-10">
						<FontAwesomeIcon
							icon={faArrowDown}
							className="text-gray-2 size-2.5"
						/>
					</div>
					<div className="flex gap-1 justify-center items-center rounded-md size-4 bg-gray-10">
						<FontAwesomeIcon
							icon={faArrowUp}
							className="text-gray-2 size-2.5"
						/>
					</div>
				</div>
			</div>
			<Link
				href="/dashboard/settings/notifications"
				onClick={onClose}
				className="flex gap-1 items-center transition-opacity duration-200 cursor-pointer hover:opacity-70"
			>
				<FontAwesomeIcon icon={faCog} className="text-gray-10 size-3" />
				<p className="text-[13px] text-gray-10">Settings</p>
			</Link>
		</div>
	);
};
