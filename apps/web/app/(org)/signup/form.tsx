"use client";

import { Button, Input, LogoBadge } from "@cap/ui";
import { motion } from "framer-motion";
import Cookies from "js-cookie";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import { signUp } from "@/actions/auth/signup";

const MotionLogoBadge = motion(LogoBadge);
const MotionLink = motion(Link);
const MotionButton = motion(Button);
const MotionInput = motion(Input);

export function SignupForm() {
	const router = useRouter();
	const theme = Cookies.get("theme") || "light";

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const nameInputId = useId();
	const emailInputId = useId();
	const passwordInputId = useId();
	const confirmPasswordInputId = useId();

	useEffect(() => {
		document.body.className = theme === "dark" ? "dark" : "light";
		return () => {
			document.body.className = "light";
		};
	}, [theme]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		setSubmitting(true);

		try {
			const result = await signUp(
				name.trim(),
				email.trim().toLowerCase(),
				password,
			);

			if (!result.success) {
				setError(result.error);
				setSubmitting(false);
				return;
			}

			// Auto sign-in with the credentials they just registered.
			const signInRes = await signIn("credentials", {
				email: email.trim().toLowerCase(),
				password,
				redirect: false,
			});

			if (signInRes?.ok && !signInRes?.error) {
				window.location.href = "/dashboard";
				return;
			}

			// Account created but auto-login failed; send them to login.
			router.push("/login");
		} catch {
			setError("Something went wrong. Please try again.");
			setSubmitting(false);
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
					Sign up to data365
				</motion.h1>
				<motion.p
					key="subtitle"
					layout="position"
					className="text-[16px] text-gray-10 mt-2 text-center"
				>
					Create your account to start watching lessons.
				</motion.p>
			</motion.div>
			<motion.div layout="position" className="flex flex-col space-y-3">
				<form onSubmit={handleSubmit} className="flex flex-col space-y-3 px-1">
					<MotionInput
						id={nameInputId}
						name="name"
						autoFocus
						type="text"
						placeholder="Your name"
						autoComplete="name"
						required
						value={name}
						disabled={submitting}
						onChange={(e) => setName(e.target.value)}
					/>
					<MotionInput
						id={emailInputId}
						name="email"
						type="email"
						placeholder="tim@apple.com"
						autoComplete="email"
						required
						value={email}
						disabled={submitting}
						onChange={(e) => setEmail(e.target.value.toLowerCase())}
					/>
					<MotionInput
						id={passwordInputId}
						name="password"
						type="password"
						placeholder="Password (min 8 characters)"
						autoComplete="new-password"
						required
						minLength={8}
						value={password}
						disabled={submitting}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<MotionInput
						id={confirmPasswordInputId}
						name="confirmPassword"
						type="password"
						placeholder="Confirm password"
						autoComplete="new-password"
						required
						minLength={8}
						value={confirmPassword}
						disabled={submitting}
						onChange={(e) => setConfirmPassword(e.target.value)}
					/>
					{error && (
						<div
							role="alert"
							aria-live="polite"
							className="flex gap-2 items-center px-3 py-2 text-sm text-red-600 rounded-lg border border-red-200 bg-red-50"
						>
							<span aria-hidden="true" className="shrink-0 text-red-500">
								&#9888;
							</span>
							<span>{error}</span>
						</div>
					)}
					<MotionButton
						variant="dark"
						type="submit"
						disabled={submitting}
						spinner={submitting}
					>
						{submitting ? "Creating account..." : "Create Account"}
					</MotionButton>
				</form>
				<motion.p
					layout="position"
					className="mt-3 mb-2 text-xs text-center text-gray-11"
				>
					Already have an account?{" "}
					<Link
						href="/login"
						className="text-xs font-semibold text-blue-9 hover:text-blue-8"
					>
						Log in here
					</Link>
				</motion.p>
				<motion.p
					layout="position"
					className="pt-3 text-xs text-center text-gray-11"
				>
					By creating an account, you acknowledge that you have both read and
					agree to 365's{" "}
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
