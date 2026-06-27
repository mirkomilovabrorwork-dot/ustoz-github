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
		<div className="flex min-h-svh w-full flex-col bg-gray-2 px-4 py-4 sm:relative sm:items-center sm:justify-center sm:px-6 sm:py-10">
			<Link
				className="mb-6 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-lg text-gray-12 transition-opacity hover:opacity-75 active:opacity-75 focus-visible:ring-2 focus-visible:ring-blue-500 sm:absolute sm:left-10 sm:top-10 sm:mb-0"
				href="/"
			>
				<FontAwesomeIcon
					className="opacity-75 size-3 text-gray-12"
					icon={faArrowLeft}
				/>
				<span>Home</span>
			</Link>
			<LoginForm />
		</div>
	);
}
