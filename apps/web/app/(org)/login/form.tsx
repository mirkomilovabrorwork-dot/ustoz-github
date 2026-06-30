"use client";

import { Button, Input, LoadingSpinner, LogoBadge } from "@cap/ui";
import { motion } from "framer-motion";
import Cookies from "js-cookie";
import { Eye, EyeOff } from "lucide-react";
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
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [redirecting, setRedirecting] = useState(false);
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
				const dest = next && next.length > 0 ? next : "/dashboard/caps";
				// Keep the hard navigation so server components pick up the fresh
				// session reliably; show a full-screen overlay so the reload reads
				// as an intentional transition instead of a jarring page reload.
				setRedirecting(true);
				window.location.href = isSafeRelativePath(dest)
					? dest
					: "/dashboard/caps";
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
		<>
			{redirecting && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-gray-1"
				>
					<LogoBadge className="size-12" />
					<LoadingSpinner size={24} themeColors />
					<p className="text-sm text-gray-10">Signing you in…</p>
				</motion.div>
			)}
			<motion.div
				layout
				transition={{
					layout: { duration: 0.3, ease: "easeInOut" },
					height: { duration: 0.3, ease: "easeInOut" },
				}}
				className="mx-auto w-full max-w-[432px] overflow-hidden rounded-2xl border border-gray-5 bg-gray-3 p-5 sm:p-7"
			>
				<MotionLink layout="position" className="flex mx-auto size-fit" href="/">
					<MotionLogoBadge layout="position" className="size-11 sm:size-12" />
				</MotionLink>
				<motion.div
					layout="position"
					className="my-5 flex flex-col items-center justify-center text-center sm:my-7"
				>
					<motion.h1
						key="title"
						layout="position"
						className="text-[1.6rem] font-semibold leading-tight text-gray-12 sm:text-2xl"
					>
						Sign in to data365
					</motion.h1>
					<motion.p
						key="subtitle"
						layout="position"
						className="mt-1 text-sm text-gray-10 sm:text-[16px]"
					>
						Record lessons and share them instantly.
					</motion.p>
				</motion.div>
				<motion.div layout="position" className="flex flex-col space-y-3">
					<form
						onSubmit={handleSubmit}
						className="flex flex-col space-y-3 sm:px-1"
					>
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
						<div className="relative">
							<MotionInput
								id={passwordInputId}
								name="password"
								type={showPassword ? "text" : "password"}
								placeholder="Password"
								autoComplete="current-password"
								required
								value={password}
								disabled={loading}
								onChange={(e) => setPassword(e.target.value)}
								className="pr-10"
							/>
							<button
								type="button"
								onClick={() => setShowPassword((v) => !v)}
								aria-label={showPassword ? "Hide password" : "Show password"}
								tabIndex={-1}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-10 hover:text-gray-12 transition-colors"
							>
								{showPassword ? (
									<EyeOff className="size-4" />
								) : (
									<Eye className="size-4" />
								)}
							</button>
						</div>
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
						data365's{" "}
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
		</>
	);
}
