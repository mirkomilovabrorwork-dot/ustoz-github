"use client";

import { Button, Input, LogoBadge } from "@cap/ui";
import { motion } from "framer-motion";
import Cookies from "js-cookie";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import { signUp } from "@/actions/auth/signup";
import { useTranslations } from "next-intl";

const MotionLogoBadge = motion(LogoBadge);
const MotionLink = motion(Link);
const MotionButton = motion(Button);
const MotionInput = motion(Input);

export function SignupForm() {
	const t = useTranslations("auth");
	const router = useRouter();
	const theme = Cookies.get("theme") || "light";

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
			setError(t("errorMinChars"));
			return;
		}

		if (password !== confirmPassword) {
			setError(t("errorMismatch"));
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
			setError(t("errorGeneric"));
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
					{t("signupTitle")}
				</motion.h1>
				<motion.p
					key="subtitle"
					layout="position"
					className="mt-2 text-sm text-gray-10 sm:text-[16px]"
				>
					{t("signupSubtitle")}
				</motion.p>
			</motion.div>
			<motion.div layout="position" className="flex flex-col space-y-3">
				<form
					onSubmit={handleSubmit}
					className="flex flex-col space-y-3 sm:px-1"
				>
					<MotionInput
						id={nameInputId}
						name="name"
						autoFocus
						type="text"
						placeholder={t("namePlaceholder")}
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
					<div className="relative">
						<MotionInput
							id={passwordInputId}
							name="password"
							type={showPassword ? "text" : "password"}
							placeholder={t("passwordPlaceholderMin")}
							autoComplete="new-password"
							required
							minLength={8}
							value={password}
							disabled={submitting}
							onChange={(e) => setPassword(e.target.value)}
							className="pr-10"
						/>
						<button
							type="button"
							onClick={() => setShowPassword((v) => !v)}
							aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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
					<div className="relative">
						<MotionInput
							id={confirmPasswordInputId}
							name="confirmPassword"
							type={showConfirmPassword ? "text" : "password"}
							placeholder={t("confirmPlaceholder")}
							autoComplete="new-password"
							required
							minLength={8}
							value={confirmPassword}
							disabled={submitting}
							onChange={(e) => setConfirmPassword(e.target.value)}
							className="pr-10"
						/>
						<button
							type="button"
							onClick={() => setShowConfirmPassword((v) => !v)}
							aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}
							tabIndex={-1}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-10 hover:text-gray-12 transition-colors"
						>
							{showConfirmPassword ? (
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
						{submitting ? t("creatingLoading") : t("createAccount")}
					</MotionButton>
				</form>
				<motion.p
					layout="position"
					className="mt-3 mb-2 text-xs text-center text-gray-11"
				>
					{t("haveAccount")}{" "}
					<Link
						href="/login"
						className="text-xs font-semibold text-blue-9 hover:text-blue-8"
					>
						{t("loginHere")}
					</Link>
				</motion.p>
				<motion.p
					layout="position"
					className="pt-3 text-xs text-center text-gray-11"
				>
					{t.rich("termsNoticeSignup", { terms: (c) => (<Link href="/terms" target="_blank" className="text-xs font-semibold text-gray-12 hover:text-blue-300">{c}</Link>), privacy: (c) => (<Link href="/privacy" target="_blank" className="text-xs font-semibold text-gray-12 hover:text-blue-300">{c}</Link>) })}
				</motion.p>
			</motion.div>
		</motion.div>
	);
}
