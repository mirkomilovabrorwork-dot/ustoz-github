"use client";

import {
	Button,
	Card,
	CardDescription,
	CardTitle,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@cap/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Copy,
	KeyRound,
	Link2,
	RotateCcw,
	Shield,
	ShieldCheck,
	ShieldOff,
	Trash2,
	UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	createUser,
	generateInviteLink,
	getInvites,
	getUsers,
	resetUserPassword,
	revokeInvite,
	revokeUser,
	toggleUserAdmin,
} from "@/actions/admin/access";

export function AccessManagement() {
	return (
		<div className="flex flex-col gap-6 p-5 mx-auto w-full max-w-4xl">
			<div className="flex items-center gap-3">
				<ShieldCheck className="size-6 text-gray-12" />
				<div>
					<h1 className="text-xl font-semibold text-gray-12">
						Access Management
					</h1>
					<p className="text-sm text-gray-11">
						Manage users, reset passwords, and generate invite links.
					</p>
				</div>
			</div>

			<UsersSection />
			<CreateUserSection />
			<InviteLinksSection />
		</div>
	);
}

function UsersSection() {
	const queryClient = useQueryClient();
	const [revokeDialogUser, setRevokeDialogUser] = useState<{
		id: string;
		name: string | null;
		email: string;
	} | null>(null);
	const [resetDialogUser, setResetDialogUser] = useState<{
		id: string;
		name: string | null;
		email: string;
	} | null>(null);
	const [newPassword, setNewPassword] = useState("");

	const { data: users, isLoading } = useQuery({
		queryKey: ["admin-users"],
		queryFn: () => getUsers(),
	});

	const revokeMutation = useMutation({
		mutationFn: (userId: string) => revokeUser(userId),
		onSuccess: (result) => {
			if (result.success) {
				toast.success("User access revoked");
				queryClient.invalidateQueries({ queryKey: ["admin-users"] });
				setRevokeDialogUser(null);
			} else {
				toast.error(result.error);
			}
		},
		onError: () => toast.error("Failed to revoke user"),
	});

	const resetMutation = useMutation({
		mutationFn: ({
			userId,
			password,
		}: { userId: string; password: string }) =>
			resetUserPassword(userId, password),
		onSuccess: (result) => {
			if (result.success) {
				toast.success("Password reset successfully");
				setResetDialogUser(null);
				setNewPassword("");
			} else {
				toast.error(result.error);
			}
		},
		onError: () => toast.error("Failed to reset password"),
	});

	const toggleAdminMutation = useMutation({
		mutationFn: (userId: string) => toggleUserAdmin(userId),
		onSuccess: (result) => {
			if (result.success) {
				toast.success(result.isAdmin ? "User promoted to admin" : "Admin privileges removed");
				queryClient.invalidateQueries({ queryKey: ["admin-users"] });
			} else {
				toast.error(result.error);
			}
		},
		onError: () => toast.error("Failed to toggle admin status"),
	});

	return (
		<>
			<Card className="flex flex-col gap-4">
				<div className="space-y-1">
					<CardTitle>Users</CardTitle>
					<CardDescription>
						All registered users. You can reset passwords or revoke access.
					</CardDescription>
				</div>

				{isLoading ? (
					<div className="py-8 text-center text-sm text-gray-11">
						Loading users...
					</div>
				) : !users?.length ? (
					<div className="py-8 text-center text-sm text-gray-11">
						No users found.
					</div>
				) : (
					<div className="overflow-x-auto -mx-5">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-gray-4">
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Name
									</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Email
									</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Role
									</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">Status</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Created
									</th>
									<th className="px-5 py-2 text-right font-medium text-gray-11">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{users.map((u) => (
									<tr
										key={u.id}
										className="border-b border-gray-3 last:border-0"
									>
										<td className="px-5 py-3 text-gray-12">
											{u.name || "—"}
										</td>
										<td className="px-5 py-3 text-gray-11">{u.email}</td>
										<td className="px-5 py-3">
											{u.isAdmin ? (
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
													<ShieldCheck className="size-3" />
													Admin
												</span>
											) : (
												<span className="text-gray-11 text-xs">User</span>
											)}
										</td>
										<td className="px-5 py-3">
											{u.accessDisabled ? (
												<span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
													Disabled
												</span>
											) : (
												<span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
													Active
												</span>
											)}
										</td>
										<td className="px-5 py-3 text-gray-11 text-xs">
											{u.createdAt
												? new Date(u.createdAt).toLocaleDateString()
												: "—"}
										</td>
										<td className="px-5 py-3 text-right">
											<div className="flex items-center justify-end gap-1">
												<Button
													variant="gray"
													size="xs"
													onClick={() => toggleAdminMutation.mutate(u.id)}
													disabled={toggleAdminMutation.isPending}
												>
													{u.isAdmin ? <ShieldOff className="size-3" /> : <Shield className="size-3" />}
													<span className="hidden sm:inline ml-1">{u.isAdmin ? "Remove Admin" : "Make Admin"}</span>
												</Button>
												<Button
													variant="gray"
													size="xs"
													onClick={() =>
														setResetDialogUser({
															id: u.id,
															name: u.name,
															email: u.email,
														})
													}
												>
													<KeyRound className="size-3" />
													<span className="hidden sm:inline ml-1">Reset</span>
												</Button>
												{!u.isAdmin && (
													<Button
														variant="destructive"
														size="xs"
														onClick={() =>
															setRevokeDialogUser({
																id: u.id,
																name: u.name,
																email: u.email,
															})
														}
													>
														<Trash2 className="size-3" />
														<span className="hidden sm:inline ml-1">
															Revoke
														</span>
													</Button>
												)}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			{/* Revoke Dialog */}
			<Dialog
				open={!!revokeDialogUser}
				onOpenChange={() => setRevokeDialogUser(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke User Access</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-gray-11 px-5">
						Are you sure you want to revoke access for{" "}
						<strong className="text-gray-12">
							{revokeDialogUser?.name || revokeDialogUser?.email}
						</strong>
						? They will no longer be able to sign in.
					</p>
					<DialogFooter>
						<Button
							variant="gray"
							size="sm"
							onClick={() => setRevokeDialogUser(null)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							spinner={revokeMutation.isPending}
							disabled={revokeMutation.isPending}
							onClick={() => {
								if (revokeDialogUser) {
									revokeMutation.mutate(revokeDialogUser.id);
								}
							}}
						>
							{revokeMutation.isPending ? "Revoking..." : "Revoke Access"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reset Password Dialog */}
			<Dialog
				open={!!resetDialogUser}
				onOpenChange={() => {
					setResetDialogUser(null);
					setNewPassword("");
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reset Password</DialogTitle>
					</DialogHeader>
					<div className="px-5 space-y-3">
						<p className="text-sm text-gray-11">
							Set a new password for{" "}
							<strong className="text-gray-12">
								{resetDialogUser?.name || resetDialogUser?.email}
							</strong>
						</p>
						<div className="flex gap-2">
							<Input
								type="text"
								placeholder="New password (min 8 characters)"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
							/>
							<Button
								variant="gray"
								size="sm"
								type="button"
								onClick={() => {
									const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
									let result = "";
									const array = new Uint8Array(16);
									crypto.getRandomValues(array);
									for (const byte of array) {
										result += chars[byte % chars.length];
									}
									setNewPassword(result);
								}}
								className="shrink-0"
							>
								<RotateCcw className="size-3" />
							</Button>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="gray"
							size="sm"
							onClick={() => {
								setResetDialogUser(null);
								setNewPassword("");
							}}
						>
							Cancel
						</Button>
						<Button
							variant="dark"
							size="sm"
							disabled={
								resetMutation.isPending || newPassword.length < 8
							}
							spinner={resetMutation.isPending}
							onClick={() => {
								if (resetDialogUser) {
									resetMutation.mutate({
										userId: resetDialogUser.id,
										password: newPassword,
									});
								}
							}}
						>
							{resetMutation.isPending ? "Resetting..." : "Reset Password"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function CreateUserSection() {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [createdPassword, setCreatedPassword] = useState<string | null>(null);

	const generatePassword = () => {
		const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
		let result = "";
		const array = new Uint8Array(16);
		crypto.getRandomValues(array);
		for (const byte of array) {
			result += chars[byte % chars.length];
		}
		setPassword(result);
	};

	const createMutation = useMutation({
		mutationFn: () => createUser(email, password, name),
		onSuccess: (result) => {
			if (result.success) {
				toast.success("User created successfully");
				queryClient.invalidateQueries({ queryKey: ["admin-users"] });
				setCreatedPassword(password);
				setName("");
				setEmail("");
				// Don't clear password yet — show it to the admin
			} else {
				toast.error(result.error);
			}
		},
		onError: () => toast.error("Failed to create user"),
	});

	const canSubmit =
		name.trim().length > 0 &&
		email.trim().length > 0 &&
		password.length >= 8 &&
		!createMutation.isPending;

	return (
		<Card className="flex flex-col gap-4">
			<div className="space-y-1">
				<CardTitle>Create User</CardTitle>
				<CardDescription>
					Create a new user account directly with a password.
				</CardDescription>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<Input
					placeholder="Full name"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<Input
					type="email"
					placeholder="Email address"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<div className="flex gap-2">
					<Input
						type="text"
						placeholder="Password (min 8 chars)"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<Button
						variant="gray"
						size="sm"
						type="button"
						onClick={generatePassword}
						className="shrink-0"
					>
						<RotateCcw className="size-3" />
					</Button>
				</div>
			</div>
			<div>
				<Button
					variant="dark"
					size="sm"
					disabled={!canSubmit}
					spinner={createMutation.isPending}
					onClick={() => createMutation.mutate()}
				>
					<UserPlus className="size-3.5 mr-1" />
					{createMutation.isPending ? "Creating..." : "Create User"}
				</Button>
			</div>
			{createdPassword && (
				<div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800">
					<p className="text-xs text-green-800 dark:text-green-400">
						User created! Password:{" "}
						<code className="font-mono font-bold">{createdPassword}</code>
					</p>
					<Button
						variant="gray"
						size="xs"
						onClick={async () => {
							await navigator.clipboard.writeText(createdPassword);
							toast.success("Password copied");
						}}
					>
						<Copy className="size-3" />
					</Button>
					<Button
						variant="gray"
						size="xs"
						onClick={() => {
							setCreatedPassword(null);
							setPassword("");
						}}
					>
						Dismiss
					</Button>
				</div>
			)}
		</Card>
	);
}

function InviteLinksSection() {
	const queryClient = useQueryClient();
	const [inviteEmail, setInviteEmail] = useState("");
	const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

	const { data: invitesList, isLoading } = useQuery({
		queryKey: ["admin-invites"],
		queryFn: () => getInvites(),
	});

	const revokeMutation = useMutation({
		mutationFn: (inviteId: string) => revokeInvite(inviteId),
		onSuccess: () => {
			toast.success("Invite revoked");
			queryClient.invalidateQueries({ queryKey: ["admin-invites"] });
		},
		onError: () => toast.error("Failed to revoke invite"),
	});

	const generateMutation = useMutation({
		mutationFn: () =>
			generateInviteLink(inviteEmail.trim() || undefined),
		onSuccess: (result) => {
			if (result.success) {
				setGeneratedUrl(result.inviteUrl);
				toast.success("Invite link generated");
				queryClient.invalidateQueries({ queryKey: ["admin-invites"] });
				setInviteEmail("");
			}
		},
		onError: () => toast.error("Failed to generate invite link"),
	});

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success("Copied to clipboard");
		} catch {
			toast.error("Failed to copy");
		}
	};

	const statusBadge = (status: "pending" | "used" | "expired") => {
		const styles = {
			pending:
				"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
			used: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
			expired:
				"bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
		};
		return (
			<span
				className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
			>
				{status.charAt(0).toUpperCase() + status.slice(1)}
			</span>
		);
	};

	return (
		<Card className="flex flex-col gap-4">
			<div className="space-y-1">
				<CardTitle>Invite Links</CardTitle>
				<CardDescription>
					Generate invite links for new users. Optionally restrict to a specific
					email.
				</CardDescription>
			</div>

			<div className="flex gap-3 items-end">
				<div className="flex-1">
					<Input
						type="email"
						placeholder="Email (optional — leave blank for open invite)"
						value={inviteEmail}
						onChange={(e) => setInviteEmail(e.target.value)}
					/>
				</div>
				<Button
					variant="dark"
					size="sm"
					disabled={generateMutation.isPending}
					spinner={generateMutation.isPending}
					onClick={() => generateMutation.mutate()}
				>
					<Link2 className="size-3.5 mr-1" />
					{generateMutation.isPending ? "Generating..." : "Generate Link"}
				</Button>
			</div>

			{generatedUrl && (
				<div className="flex items-center gap-2 p-3 rounded-lg bg-gray-3 border border-gray-4">
					<code className="flex-1 text-xs text-gray-12 break-all">
						{generatedUrl}
					</code>
					<Button
						variant="gray"
						size="xs"
						onClick={() => copyToClipboard(generatedUrl)}
					>
						<Copy className="size-3" />
					</Button>
				</div>
			)}

			<div className="mt-2">
				<p className="text-xs font-medium text-gray-11 mb-2">
					Existing Invites
				</p>
				{isLoading ? (
					<div className="py-4 text-center text-sm text-gray-11">
						Loading invites...
					</div>
				) : !invitesList?.length ? (
					<div className="py-4 text-center text-sm text-gray-11">
						No invites generated yet.
					</div>
				) : (
					<div className="overflow-x-auto -mx-5">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-gray-4">
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Token
									</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Email
									</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Status
									</th>
									<th className="px-5 py-2 text-left font-medium text-gray-11">
										Expires
									</th>
									<th className="px-5 py-2 text-right font-medium text-gray-11">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{invitesList.map((inv) => (
									<tr
										key={inv.id}
										className="border-b border-gray-3 last:border-0"
									>
										<td className="px-5 py-3 text-gray-11 font-mono text-xs">
											{inv.token.slice(0, 8)}...
										</td>
										<td className="px-5 py-3 text-gray-11">
											{inv.email || "Open invite"}
										</td>
										<td className="px-5 py-3">
											{statusBadge(inv.status)}
										</td>
										<td className="px-5 py-3 text-gray-11 text-xs">
											{inv.expiresAt
												? new Date(inv.expiresAt).toLocaleDateString()
												: "—"}
										</td>
										<td className="px-5 py-3 text-right">
											{inv.status === "pending" && (
												<div className="flex items-center justify-end gap-1">
													<Button
														variant="gray"
														size="xs"
														onClick={() => {
															const baseUrl = window.location.origin;
															copyToClipboard(`${baseUrl}/invite/${inv.token}`);
														}}
													>
														<Copy className="size-3" />
														<span className="hidden sm:inline ml-1">Copy</span>
													</Button>
													<Button
														variant="destructive"
														size="xs"
														onClick={() => revokeMutation.mutate(inv.id)}
														disabled={revokeMutation.isPending}
													>
														<Trash2 className="size-3" />
														<span className="hidden sm:inline ml-1">Revoke</span>
													</Button>
												</div>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</Card>
	);
}
