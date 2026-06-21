import { getCurrentUser } from "@cap/database/auth/session";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

function isSafeRelativePath(path: string) {
	return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

export default async function LoginPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const session = await getCurrentUser();
	if (session) {
		const sp = await props.searchParams;
		const next = typeof sp.next === "string" ? sp.next : null;
		redirect(next && isSafeRelativePath(next) ? next : "/dashboard");
	}
	return (
		<div className="flex relative justify-center items-center w-full h-screen bg-gray-2">
			<div className="flex absolute top-10 left-10 gap-2 justify-center items-center min-h-[44px] min-w-[44px] transition-opacity hover:opacity-75 active:opacity-75 focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg">
				<FontAwesomeIcon
					className="opacity-75 size-3 text-gray-12"
					icon={faArrowLeft}
				/>
				<Link className="text-gray-12" href="/">
					Home
				</Link>
			</div>
			<LoginForm />
		</div>
	);
}
