import { getCurrentUser } from "@cap/database/auth/session";
import { buildEnv } from "@cap/env";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeveloperSidebarRegistrar } from "./_components/DeveloperSidebarRegistrar";
import { DeveloperThemeForcer } from "./_components/DeveloperThemeForcer";
import { DevelopersProvider } from "./DevelopersContext";
import { getDeveloperApps } from "./developer-data";

const DEVELOPER_DASHBOARD_ALLOWED_EMAILS = ["richie@cap.so"];

export const metadata: Metadata = {
	title: "Developers — data365",
};

export default async function DevelopersLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/signin");

	if (
		!buildEnv.NEXT_PUBLIC_IS_CAP ||
		!DEVELOPER_DASHBOARD_ALLOWED_EMAILS.includes(user.email)
	)
		notFound();

	const apps = await getDeveloperApps(user);

	return (
		<DevelopersProvider apps={apps}>
			<DeveloperThemeForcer>
				<DeveloperSidebarRegistrar apps={apps} />
				{children}
			</DeveloperThemeForcer>
		</DevelopersProvider>
	);
}
