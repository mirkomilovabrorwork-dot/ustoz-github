"use client";

import { Button, Input, LogoBadge } from "@cap/ui";
import { motion } from "framer-motion";
import Cookies from "js-cookie";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

const MotionLogoBadge = motion(LogoBadge);
const MotionLink = motion(Link);
const MotionButton = motion(Button);
const MotionInput = motion(Input);

function isSafeRelativePath(path: string) {
	return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

export function LoginForm() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const next = searchParams?.get("next");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const emailInputId = useId();
	const passwordInputId = useId();
	const theme = Cookies.get("theme") || "light";

	useEffect(() => {
		document.body.className = theme === "dark" ? "dark" : "light";
		return () => {
			document.body.className = "light";
		};
	}, [theme]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			const res = await signIn("credentials", {
				email: email.trim().toLowerCase(),
				password,
				redirect: false,
			});

			if (res?.ok && !res?.error) {
				const dest = next && next.length > 0 ? next : "/dashboard";
				window.location.href = isSafeRelativePath(dest) ? dest : "/dashboard";
				return;
			}

			setError("Invalid email or password.");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<motion.div
			layout
			transition={{
				layout: { duration: 0.3, ease: "easeInOut" },
				height: { duration: 0.3, ease: "easeInOut" },
			}}
			className="overflow-hidden relative w-[calc(100%-32px)] p-[28px] max-w-[432px] bg-gray-3 border border-gray-5 rounded-2xl"
		>
			<MotionLink layout="position" className="flex mx-auto size-fit" href="/">
				<MotionLogoBadge layout="position" className="size-12" />
			</MotionLink>
			<motion.div
				layout="position"
				className="flex flex-col justify-center items-center my-7 text-left"
			>
				<motion.h1
					key="title"
					layout="position"
					className="text-2xl font-semibold text-gray-12"
				>
					Sign in to 365
				</motion.h1>
				<motion.p
					key="subtitle"
					layout="position"
					className="text-[16px] text-gray-10"
				>
					Record lessons and share them instantly.
				</motion.p>
			</motion.div>
			<motion.div layout="position" className="flex flex-col space-y-3">
				<form onSubmit={handleSubmit} className="flex flex-col space-y-3 px-1">
					<MotionInput
						id={emailInputId}
						name="email"
						autoFocus
						type="email"
						placeholder="tim@apple.com"
						autoComplete="email"
						required
						value={email}
						disabled={loading}
						onChange={(e) => setEmail(e.target.value.toLowerCase())}
					/>
					<MotionInput
						id={passwordInputId}
						name="password"
						type="password"
						placeholder="Password"
						autoComplete="current-password"
						required
						value={password}
						disabled={loading}
						onChange={(e) => setPassword(e.target.value)}
					/>
					{error && (
						<div
							role="alert"
							aria-live="polite"
							className="flex gap-2 items-center px-3 py-2 text-sm text-red-600 rounded-lg border border-red-200 bg-red-50"
						>
							<span aria-hidden="true" className="shrink-0 text-red-500">&#9888;</span>
							<span>{error}</span>
						</div>
					)}
					<MotionButton
						variant="dark"
						type="submit"
						disabled={loading}
						spinner={loading}
					>
						{loading ? "Signing in..." : "Sign in"}
					</MotionButton>
				</form>
				<motion.p
					layout="position"
					className="mt-3 mb-2 text-xs text-center text-gray-11"
				>
					Don't have an account?{" "}
					<Link
						href="/signup"
						className="text-xs font-semibold text-blue-9 hover:text-blue-8"
					>
						Sign up here
					</Link>
				</motion.p>
				<motion.p
					layout="position"
					className="pt-3 text-xs text-center text-gray-11"
				>
					By signing in, you acknowledge that you have both read and agree to
					365's{" "}
					<Link
						href="/terms"
						target="_blank"
						className="text-xs font-semibold text-gray-12 hover:text-blue-300"
					>
						Terms of Service
					</Link>{" "}
					and{" "}
					<Link
						href="/privacy"
						target="_blank"
						className="text-xs font-semibold text-gray-12 hover:text-blue-300"
					>
						Privacy Policy
					</Link>
					.
				</motion.p>
			</motion.div>
		</motion.div>
	);
}
