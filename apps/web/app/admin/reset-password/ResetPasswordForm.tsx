"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";
import { resetUserPassword } from "@/actions/admin/reset-user-password";

type Status =
	| { type: "idle" }
	| { type: "submitting" }
	| { type: "success" }
	| { type: "error"; message: string };

export function ResetPasswordForm() {
	const [email, setEmail] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [status, setStatus] = useState<Status>({ type: "idle" });
	const emailInputId = useId();
	const passwordInputId = useId();

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			const trimmedEmail = email.trim();
			if (!trimmedEmail || !newPassword || status.type === "submitting") return;

			setStatus({ type: "submitting" });

			try {
				const result = await resetUserPassword(trimmedEmail, newPassword);
				if (result.success) {
					setStatus({ type: "success" });
					setEmail("");
					setNewPassword("");
				} else {
					setStatus({ type: "error", message: result.error });
				}
			} catch (err) {
				setStatus({
					type: "error",
					message: err instanceof Error ? err.message : "Something went wrong",
				});
			}
		},
		[email, newPassword, status.type],
	);

	const canSubmit =
		email.trim().length > 0 &&
		newPassword.length > 0 &&
		status.type !== "submitting";

	return (
		<div className="mx-auto w-full max-w-xl px-5 py-8 md:px-8 md:py-10">
			<div className="mb-6">
				<Link
					href="/admin"
					className="mb-4 inline-flex text-sm font-medium text-gray-500 transition hover:text-gray-900"
				>
					Back to admin
				</Link>
				<h1 className="text-2xl font-semibold tracking-tight text-gray-900">
					Reset User Password
				</h1>
				<p className="mt-1 text-sm text-gray-500">
					Set a new password for a user by email.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-5">
				<div>
					<label
						htmlFor={emailInputId}
						className="mb-1.5 block text-sm font-medium text-gray-700"
					>
						User email
					</label>
					<input
						id={emailInputId}
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="user@example.com"
						className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					/>
				</div>

				<div>
					<label
						htmlFor={passwordInputId}
						className="mb-1.5 block text-sm font-medium text-gray-700"
					>
						New password
					</label>
					<input
						id={passwordInputId}
						type="password"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						placeholder="At least 8 characters"
						className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					/>
				</div>

				<button
					type="submit"
					disabled={!canSubmit}
					className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
				>
					{status.type === "submitting" ? "Resetting..." : "Reset Password"}
				</button>
			</form>

			{status.type === "success" && (
				<div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
					<div className="font-medium">Password reset</div>
					<div className="mt-1">The user's password has been updated.</div>
				</div>
			)}

			{status.type === "error" && (
				<div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{status.message}
				</div>
			)}
		</div>
	);
}
