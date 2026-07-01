import { getCurrentUser } from "@cap/database/auth/session";
import { notFound } from "next/navigation";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
	const user = await getCurrentUser();
	if (!user?.isAdmin) notFound();

	return <ResetPasswordForm />;
}
