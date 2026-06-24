"use client";

import { Button, Input } from "@cap/ui";
import { formatPlatformDateTime } from "@cap/utils";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { createInviteLink } from "@/actions/organization/invite-by-link";

type Mode = "direct" | "link";

export function InviteMemberForm() {
	const emailId = useId();
	const roleId = useId();
	const router = useRouter();
	const [mode, setMode] = useState<Mode>("direct");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"admin" | "member">("member");
	const [loading, setLoading] = useState(false);
	const [generatedLink, setGeneratedLink] = useState<string | null>(null);
	const [generatedLinkEmail, setGeneratedLinkEmail] = useState("");

	return (
		<div className="space-y-3 p-4 border border-gray-4 rounded">
			<div className="inline-flex items-center gap-0.5 rounded-lg bg-gray-3 p-0.5">
				<button
					type="button"
					className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
						mode === "direct"
							? "bg-gray-1 text-gray-12 shadow-sm"
							: "text-gray-10 hover:text-gray-12"
					}`}
					onClick={() => {
						setMode("direct");
						setGeneratedLink(null);
						setGeneratedLinkEmail("");
					}}
				>
					Add by email
				</button>
				<button
					type="button"
					className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
						mode === "link"
							? "bg-gray-1 text-gray-12 shadow-sm"
							: "text-gray-10 hover:text-gray-12"
					}`}
					onClick={() => {
						setMode("link");
						setGeneratedLink(null);
						setGeneratedLinkEmail("");
					}}
				>
					Generate one-time link
				</button>
			</div>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					if (!email) return;
					setLoading(true);
					try {
						const inviteEmail = email.trim();
						if (mode === "direct") {
							const { url, expiresAt } = await createInviteLink({
								email: inviteEmail,
								role,
							});
							setGeneratedLink(url);
							setGeneratedLinkEmail(inviteEmail);
							toast.success(
								`Invite link ready until ${formatPlatformDateTime(expiresAt)}`,
							);
							setEmail("");
							router.refresh();
						} else {
							const { url, expiresAt } = await createInviteLink({
								email: inviteEmail,
								role,
							});
							setGeneratedLink(url);
							setGeneratedLinkEmail(inviteEmail);
							toast.success(
								`Link valid until ${formatPlatformDateTime(expiresAt)}`,
							);
						}
					} catch (err) {
						toast.error((err as Error).message);
					} finally {
						setLoading(false);
					}
				}}
				className="flex flex-col gap-2 sm:flex-row sm:items-end"
			>
				<div className="flex-1">
					<label htmlFor={emailId} className="text-sm text-gray-12">
						Email
					</label>
					<Input
						id={emailId}
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						type="email"
						required
					/>
				</div>
				<div>
					<label htmlFor={roleId} className="text-sm text-gray-12">
						Role
					</label>
					<select
						id={roleId}
						className="block border border-gray-4 rounded px-2 py-1 bg-gray-1 text-gray-12"
						value={role}
						onChange={(e) => setRole(e.target.value as "admin" | "member")}
					>
						<option value="member">Member</option>
						<option value="admin">Admin</option>
					</select>
				</div>
				<Button type="submit" disabled={loading} variant="dark">
					{loading
						? "Working..."
						: mode === "direct"
							? "Add member"
							: "Generate link"}
				</Button>
			</form>
			{generatedLink && (
				<div className="p-3 bg-gray-2 rounded border border-gray-4 space-y-2">
					<p className="text-sm font-medium text-gray-12">
						Invite link ready
					</p>
					<p className="text-sm text-gray-10">
						Email may not send on self-hosted installs. Copy this link and send
						it to <strong>{generatedLinkEmail}</strong> manually. It expires in
						72 hours and can only be used once.
					</p>
					<div className="flex gap-2">
						<Input
							value={generatedLink}
							readOnly
							className="flex-1 font-mono text-xs"
						/>
						<Button
							type="button"
							variant="gray"
							onClick={() => {
								navigator.clipboard.writeText(generatedLink);
								toast.success("Link copied");
							}}
						>
							Copy
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
