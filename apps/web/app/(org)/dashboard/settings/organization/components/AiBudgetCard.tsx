"use client";

import { Button, Card, CardDescription, CardTitle, Switch } from "@cap/ui";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { getMonthlySpend } from "@/actions/billing/get-monthly-spend";
import { saveAiBudget } from "@/actions/billing/save-ai-budget";
import {
	canManageOrganizationSettings,
	getEffectiveOrganizationRole,
} from "@/lib/permissions/roles";
import { useDashboardContext } from "../../../Contexts";

type AiBudgetSettings = {
	monthlyUsdCents: number;
	alertAtPct: number;
	enabled: boolean;
};

export const AiBudgetCard = () => {
	const { activeOrganization, user } = useDashboardContext();

	const currentMember = activeOrganization?.members.find(
		(member) => member.userId === user.id,
	);
	const currentRole = getEffectiveOrganizationRole({
		userId: user.id,
		ownerId: activeOrganization?.organization.ownerId,
		memberRole: currentMember?.role,
	});
	const isAdmin = canManageOrganizationSettings(currentRole);

	const orgSettings = activeOrganization?.organization.settings as
		| (NonNullable<typeof activeOrganization>["organization"]["settings"] & {
				aiBudget?: AiBudgetSettings;
		  })
		| null
		| undefined;
	const savedBudget = orgSettings?.aiBudget;

	const userBudget = (
		user as { preferences?: { aiBudget?: AiBudgetSettings } | null }
	)?.preferences?.aiBudget;

	const [enabled, setEnabled] = useState(savedBudget?.enabled ?? false);
	const [dollars, setDollars] = useState(
		savedBudget ? (savedBudget.monthlyUsdCents / 100).toFixed(2) : "10.00",
	);
	const [alertPct, setAlertPct] = useState(savedBudget?.alertAtPct ?? 80);
	const [saving, setSaving] = useState(false);
	const [orgSpentCents, setOrgSpentCents] = useState<number | null>(null);
	const dollarsId = useId();
	const alertId = useId();

	const orgId = activeOrganization?.organization.id;

	useEffect(() => {
		if (!orgId) return;
		getMonthlySpend({ type: "org", id: orgId }).then((result) => {
			setOrgSpentCents(result.totalUsdCents);
		});
	}, [orgId]);

	const monthlyUsdCents = Math.max(0, Math.round(parseFloat(dollars) * 100));
	const spentDollars =
		orgSpentCents != null ? (orgSpentCents / 100).toFixed(2) : null;
	const spentPct =
		orgSpentCents != null && monthlyUsdCents > 0
			? Math.round((orgSpentCents / monthlyUsdCents) * 100)
			: 0;

	const userCapCents = userBudget?.enabled ? userBudget.monthlyUsdCents : null;
	const effectiveCap =
		userCapCents != null && userCapCents < monthlyUsdCents
			? userCapCents
			: null;

	const handleSave = async () => {
		if (Number.isNaN(parseFloat(dollars))) {
			toast.error("Enter a valid dollar amount");
			return;
		}
		setSaving(true);
		try {
			await saveAiBudget({
				scope: "org",
				monthlyUsdCents,
				alertAtPct: alertPct,
				enabled,
			});
			toast.success("Organization AI budget saved");
		} catch {
			toast.error("Failed to save organization AI budget");
		} finally {
			setSaving(false);
		}
	};

	if (!isAdmin) return null;

	return (
		<Card className="flex flex-col gap-4">
			<div className="space-y-1">
				<CardTitle>AI Budget Limit</CardTitle>
				<CardDescription>
					Set an organization-wide monthly spending cap for AI features. Applies
					to all members.
				</CardDescription>
			</div>

			<div className="flex justify-between items-center">
				<span className="text-sm text-gray-12">Enable budget limit</span>
				<Switch checked={enabled} onCheckedChange={setEnabled} />
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor={dollarsId} className="text-xs text-gray-10">
					Monthly limit
				</label>
				<div className="flex items-center gap-1">
					<span className="text-sm text-gray-12">$</span>
					<input
						id={dollarsId}
						type="number"
						min="0"
						step="1"
						value={dollars}
						onChange={(e) => setDollars(e.target.value)}
						disabled={!enabled}
						className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-3 bg-gray-1 text-gray-12 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-11"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex justify-between items-center">
					<label htmlFor={alertId} className="text-xs text-gray-10">
						Alert me at
					</label>
					<span className="text-xs font-medium text-gray-12">{alertPct}%</span>
				</div>
				<input
					id={alertId}
					type="range"
					min={50}
					max={95}
					step={5}
					value={alertPct}
					onChange={(e) => setAlertPct(Number(e.target.value))}
					disabled={!enabled}
					className="w-full accent-blue-11 disabled:opacity-50"
				/>
				<div className="flex justify-between text-[10px] text-gray-9">
					<span>50%</span>
					<span>95%</span>
				</div>
			</div>

			{spentDollars != null && (
				<p className="text-xs text-gray-10">
					This month so far:{" "}
					<span className="font-medium text-gray-12">${spentDollars}</span>
					{monthlyUsdCents > 0 && <span> ({spentPct}%)</span>}
				</p>
			)}

			{effectiveCap != null && (
				<p className="text-xs text-blue-11">
					Your effective cap: ${(effectiveCap / 100).toFixed(2)} (limited by
					your personal budget)
				</p>
			)}

			<Button
				type="button"
				size="xs"
				variant="dark"
				onClick={handleSave}
				spinner={saving}
				disabled={saving}
			>
				{saving ? "Saving..." : "Save"}
			</Button>
		</Card>
	);
};
