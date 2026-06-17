"use client";

import { Button, Input } from "@cap/ui";
import { formatPlatformDateTime } from "@cap/utils";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { inviteByEmail } from "@/actions/organization/invite-by-email";
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

	return (
		<div className="space-y-3 p-4 border rounded">
			<div className="flex gap-2">
				<Button
					variant={mode === "direct" ? "dark" : "gray"}
					onClick={() => {
						setMode("direct");
						setGeneratedLink(null);
					}}
					type="button"
				>
					Add by email
				</Button>
				<Button
					variant={mode === "link" ? "dark" : "gray"}
					onClick={() => {
						setMode("link");
						setGeneratedLink(null);
					}}
					type="button"
				>
					Generate one-time link
				</Button>
			</div>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					if (!email) return;
					setLoading(true);
					try {
						if (mode === "direct") {
							await inviteByEmail({ email, role });
							toast.success(
								`${email} added — they can sign in at /login with this email.`,
								{ duration: 6000 },
							);
							setEmail("");
							router.refresh();
						} else {
							const { url, expiresAt } = await createInviteLink({
								email,
								role,
							});
							setGeneratedLink(url);
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
				className="flex gap-2 items-end"
			>
				<div className="flex-1">
					<label htmlFor={emailId} className="text-sm">
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
					<label htmlFor={roleId} className="text-sm">
						Role
					</label>
					<select
						id={roleId}
						className="block border rounded px-2 py-1"
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
				<div className="p-3 bg-gray-2 rounded border space-y-2">
					<p className="text-sm text-gray-500">
						Copy this link and share it with <strong>{email}</strong>. It
						expires in 72 hours and can only be used once.
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
