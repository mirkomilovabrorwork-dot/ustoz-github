"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISS_KEY = "data365-ext-reinstall-v1-dismissed";

export default function ExtensionUpdateBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		try {
			if (localStorage.getItem(DISMISS_KEY) !== "true") {
				setVisible(true);
			}
		} catch {
			// localStorage unavailable (e.g. private browsing with blocked storage)
		}
	}, []);

	if (!visible) return null;

	function dismiss() {
		try {
			localStorage.setItem(DISMISS_KEY, "true");
		} catch {
			// ignore
		}
		setVisible(false);
	}

	return (
		<div className="flex items-center gap-3 w-full border-b border-blue-4 bg-blue-2 px-4 py-2.5 text-sm text-gray-12">
			<p className="flex-1 min-w-0">
				<span className="font-medium">Extension update required —</span>{" "}
				We improved the screen recorder. Because the extension is installed
				manually, please remove the old version and reinstall it to get the
				fix.{" "}
				<Link
					href="/dashboard/extension"
					className="font-medium text-blue-11 underline underline-offset-2 hover:text-blue-9 transition-colors"
				>
					Update extension &rarr;
				</Link>
			</p>
			<button
				type="button"
				onClick={dismiss}
				aria-label="Dismiss"
				className="flex-shrink-0 rounded p-1 text-gray-9 hover:text-gray-12 transition-colors"
			>
				<X size={16} aria-hidden="true" />
				<span className="sr-only">Close</span>
			</button>
		</div>
	);
}
