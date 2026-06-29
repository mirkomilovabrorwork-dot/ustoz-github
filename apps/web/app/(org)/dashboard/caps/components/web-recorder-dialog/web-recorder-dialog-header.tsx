"use client";

import { Logo } from "@cap/ui";

// Header is purely the data365 wordmark/logo. Closing the dialog is handled by
// the dedicated CloseButton (✕) and by Escape via Radix — not from here.
export const WebRecorderDialogHeader = () => {
	return (
		<>
			<div className="flex items-center justify-between pb-[0.25rem]">
				<div className="flex items-center space-x-1">
					<Logo className="h-9 w-auto" />
				</div>
			</div>
		</>
	);
};
