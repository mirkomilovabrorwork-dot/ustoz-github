import { getCurrentUser } from "@cap/database/auth/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrgAiSpend } from "@/actions/billing/get-org-ai-spend";
import { getOrganizationAccess } from "@/actions/organization/authorization";
import { canViewOrganizationSettings } from "@/lib/permissions/roles";
import { AiSpend } from "./AiSpend";

export const metadata: Metadata = {
	title: "AI Spend — data365",
};

export default async function AiSpendPage() {
	const user = await getCurrentUser();
	if (!user) redirect("/login");

	if (!user.activeOrganizationId) redirect("/dashboard");

	const access = await getOrganizationAccess(
		user.id,
		user.activeOrganizationId,
	);

	if (!access || !canViewOrganizationSettings(access.role)) {
		redirect("/dashboard");
	}

	const initialData = await getOrgAiSpend(user.activeOrganizationId);

	return (
		<AiSpend orgId={user.activeOrganizationId} initialData={initialData} />
	);
}
