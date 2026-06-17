const ADMIN_EMAILS = ["bmirzaxojayev@gmail.com", "data365.online@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return ADMIN_EMAILS.includes(email.toLowerCase());
}
