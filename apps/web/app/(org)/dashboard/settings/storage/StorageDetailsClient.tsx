"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { getStorageUsage } from "@/actions/organization/get-storage-usage";
import { updateStorageSettings } from "@/actions/organization/update-storage-settings";

function fmtBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let v = bytes / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

const GB = 1024 * 1024 * 1024;
const bytesToGB = (b: number | null) =>
	b == null ? "" : (b / GB).toFixed(b < 10 * GB ? 1 : 0);
const gbToBytes = (s: string) => {
	const n = Number(s);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(n * GB);
};

type Data = Awaited<ReturnType<typeof getStorageUsage>>;

export function StorageDetailsClient({ data }: { data: Data }) {
	const pct = data.percentUsed;
	const barColor =
		pct >= 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-blue-500";

	return (
		<div className="p-6 max-w-5xl mx-auto space-y-8">
			<section>
				<h1 className="text-2xl font-semibold mb-2">Storage</h1>
				<p className="text-gray-10 mb-4">
					{fmtBytes(data.usedBytes)} used of {fmtBytes(data.quotaBytes)} (
					{pct.toFixed(1)}%)
					{data.enforceQuota && (
						<span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
							Quota enforced
						</span>
					)}
				</p>
				<div className="h-3 w-full rounded-full bg-gray-4 overflow-hidden">
					<div
						className={`h-full rounded-full ${barColor}`}
						style={{ width: `${pct}%` }}
					/>
				</div>
			</section>

			{data.isOwner && (
				<QuotaSettingsForm
					initialOrgQuotaGB={bytesToGB(data.quotaBytes)}
					initialUserQuotaGB={bytesToGB(data.userQuotaBytes)}
					initialEnforce={data.enforceQuota}
				/>
			)}

			<section>
				<h2 className="text-lg font-medium mb-3">By Folder</h2>
				<div className="space-y-2">
					{data.byFolder.map((f) => (
						<div
							key={f.folderId ?? "root"}
							className="flex justify-between items-center p-3 border rounded"
						>
							<span>{f.folderName}</span>
							<span className="text-sm text-gray-10">{fmtBytes(f.bytes)}</span>
						</div>
					))}
				</div>
			</section>

			<section>
				<h2 className="text-lg font-medium mb-3">
					By User
					{data.userQuotaBytes != null && data.userQuotaBytes > 0 && (
						<span className="ml-2 text-xs font-normal text-gray-10">
							(limit: {fmtBytes(data.userQuotaBytes)} per user)
						</span>
					)}
				</h2>
				<div className="space-y-2">
					{data.byUser.map((u) => {
						const userPct =
							data.userQuotaBytes && data.userQuotaBytes > 0
								? Math.min(100, (u.bytes / data.userQuotaBytes) * 100)
								: null;
						return (
							<div
								key={u.userId}
								className={`p-3 border rounded ${
									u.overQuota
										? "border-red-300 bg-red-50"
										: "border-gray-5 bg-white"
								}`}
							>
								<div className="flex justify-between items-center">
									<div>
										<div>{u.name ?? u.email}</div>
										<div className="text-xs text-gray-9">{u.email}</div>
									</div>
									<div className="text-right">
										<div
											className={`text-sm ${
												u.overQuota
													? "text-red-700 font-medium"
													: "text-gray-10"
											}`}
										>
											{fmtBytes(u.bytes)}
											{userPct != null && (
												<span className="ml-2 text-xs text-gray-9">
													{userPct.toFixed(0)}%
												</span>
											)}
										</div>
										{u.overQuota && (
											<div className="text-[11px] text-red-600">Over quota</div>
										)}
									</div>
								</div>
								{userPct != null && (
									<div className="mt-2 h-1 w-full rounded-full bg-gray-4 overflow-hidden">
										<div
											className={`h-full rounded-full ${
												u.overQuota
													? "bg-red-500"
													: userPct > 75
														? "bg-amber-500"
														: "bg-blue-500"
											}`}
											style={{ width: `${Math.max(userPct, 1)}%` }}
										/>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</section>

			<section>
				<h2 className="text-lg font-medium mb-3">Top Videos by Size</h2>
				<div className="space-y-2">
					{data.byVideo.map((v) => (
						<div
							key={v.videoId}
							className="flex justify-between items-center p-3 border rounded"
						>
							<span className="truncate">{v.name}</span>
							<span className="text-sm text-gray-10 shrink-0 ml-3">
								{fmtBytes(v.bytes)}
							</span>
						</div>
					))}
					{data.byVideo.length === 0 && (
						<p className="text-sm text-gray-9">No videos yet.</p>
					)}
				</div>
			</section>
		</div>
	);
}

function QuotaSettingsForm({
	initialOrgQuotaGB,
	initialUserQuotaGB,
	initialEnforce,
}: {
	initialOrgQuotaGB: string;
	initialUserQuotaGB: string;
	initialEnforce: boolean;
}) {
	const [orgGB, setOrgGB] = useState(initialOrgQuotaGB);
	const [userGB, setUserGB] = useState(initialUserQuotaGB);
	const [enforce, setEnforce] = useState(initialEnforce);
	const [pending, startTransition] = useTransition();

	const handleSave = () => {
		startTransition(async () => {
			const res = await updateStorageSettings({
				storageQuotaBytes: gbToBytes(orgGB),
				userQuotaBytes: userGB ? gbToBytes(userGB) : null,
				enforceQuota: enforce,
			});
			if (res.ok) toast.success("Storage settings saved");
			else toast.error(res.error);
		});
	};

	return (
		<section className="p-4 border rounded-lg bg-gray-2 space-y-4">
			<div>
				<h2 className="text-lg font-medium">Storage limits</h2>
				<p className="text-xs text-gray-10">
					Only the workspace owner can change these.
				</p>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium text-gray-12">
						Organization quota (GB)
					</span>
					<input
						type="number"
						min={1}
						step={1}
						value={orgGB}
						onChange={(e) => setOrgGB(e.target.value)}
						className="px-3 py-2 rounded border border-gray-5 bg-white text-sm"
						disabled={pending}
					/>
					<span className="text-[11px] text-gray-9">
						Default 50 GB. Hard cap when enforcement is on.
					</span>
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium text-gray-12">
						Per-user quota (GB)
					</span>
					<input
						type="number"
						min={0}
						step={1}
						value={userGB}
						placeholder="No per-user limit"
						onChange={(e) => setUserGB(e.target.value)}
						className="px-3 py-2 rounded border border-gray-5 bg-white text-sm"
						disabled={pending}
					/>
					<span className="text-[11px] text-gray-9">
						Leave blank for no per-user cap.
					</span>
				</label>
			</div>
			<label className="flex items-center gap-2 text-sm text-gray-12">
				<input
					type="checkbox"
					checked={enforce}
					onChange={(e) => setEnforce(e.target.checked)}
					disabled={pending}
				/>
				Enforce quotas — block new uploads when over the limit
			</label>
			<div>
				<button
					type="button"
					onClick={handleSave}
					disabled={pending}
					className="px-4 py-2 rounded-md bg-blue-9 text-white text-sm font-medium hover:bg-blue-10 disabled:opacity-50"
				>
					{pending ? "Saving…" : "Save"}
				</button>
			</div>
		</section>
	);
}
