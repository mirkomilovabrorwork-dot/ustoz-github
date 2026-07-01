import { getCurrentUser } from "@cap/database/auth/session";
import { redirect } from "next/navigation";
import { SettingsSectionNav } from "./_components/SettingsSectionNav";

export default async function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUser();

	if (!user) {
		redirect("/login");
	}

	return (
		<div className="flex flex-col gap-6">
			<SettingsSectionNav isAdmin={!!user.isAdmin} />
			{children}
		</div>
	);
}
