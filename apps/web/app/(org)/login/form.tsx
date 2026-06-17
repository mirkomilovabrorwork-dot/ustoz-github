"use client";

import { Button, Input, LogoBadge } from "@cap/ui";
import { Organisation } from "@cap/web-domain";
import {
	faArrowLeft,
	faEnvelope,
	faExclamationCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import Cookies from "js-cookie";
import { LucideArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { requestOtp } from "@/actions/auth/request-otp";
import { getOrganizationSSOData } from "@/actions/organization/get-organization-sso-data";
import { trackEvent } from "@/app/utils/analytics";
import { usePublicEnv } from "@/utils/public-env";

const MotionInput = motion(Input);
const MotionLogoBadge = motion(LogoBadge);
const MotionLink = motion(Link);
const MotionButton = motion(Button);

export function LoginForm() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const next = searchParams?.get("next");
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [oauthError, setOauthError] = useState(false);
	const [showOrgInput, setShowOrgInput] = useState(false);
	const [step, setStep] = useState<"email" | "code">("email");
	const [code, setCode] = useState("");
	const [organizationId, setOrganizationId] = useState("");
	const [organizationName, setOrganizationName] = useState<string | null>(null);
	const theme = Cookies.get("theme") || "light";

	useEffect(() => {
		document.body.className = theme === "dark" ? "dark" : "light";
		return () => {
			document.body.className = "light";
		};
	}, [theme]);

	useEffect(() => {
		const error = searchParams?.get("error");
		const errorDesc = searchParams?.get("error_description");

		const handleErrors = () => {
			if (error === "OAuthAccountNotLinked" && !errorDesc) {
				setOauthError(true);
				return toast.error(
					"This email is already associated with a different sign-in method",
				);
			} else if (
				error === "profile_not_allowed_outside_organization" &&
				!errorDesc
			) {
				return toast.error(
					"Your email domain is not authorized for SSO access. Please use your work email or contact your administrator.",
				);
			} else if (error && errorDesc) {
				return toast.error(errorDesc);
			}
		};
		handleErrors();
	}, [searchParams]);

	const handleGoogleSignIn = () => {
		trackEvent("auth_started", {
			method: "google",
			is_signup: false,
			auth_surface: "login",
		});
		signIn("google", {
			...(next && next.length > 0 ? { callbackUrl: next } : {}),
		});
	};

	const handleOrganizationLookup = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!organizationId) {
			toast.error("Please enter an organization ID");
			return;
		}

		try {
			const data = await getOrganizationSSOData(
				Organisation.OrganisationId.make(organizationId),
			);
			setOrganizationName(data.name);

			signIn("workos", undefined, {
				organization: data.organizationId,
				connection: data.connectionId,
			});
		} catch (error) {
			console.error("Lookup Error:", error);
			toast.error("Organization not found or SSO not configured");
		}
	};

	return (
		<motion.div
			layout
			transition={{
				layout: { duration: 0.3, ease: "easeInOut" },
				height: { duration: 0.3, ease: "easeInOut" },
			}}
			className="overflow-hidden relative w-[calc(100%-5%)] p-[28px] max-w-[432px] bg-gray-3 border border-gray-5 rounded-2xl"
		>
			<motion.div
				layout="position"
				key="back-button"
				initial={{ opacity: 0, display: "none" }}
				animate={{
					opacity: showOrgInput ? 1 : 0,
					display: showOrgInput ? "flex" : "none",
					transition: { duration: 0.1, delay: 0.2 },
				}}
				onClick={() => setShowOrgInput(false)}
				className="absolute overflow-hidden top-5 rounded-full left-5 z-20 hover:bg-gray-1 gap-2 items-center py-1.5 px-3 text-gray-12 bg-transparent border border-gray-4 transition-colors duration-300 cursor-pointer"
			>
				<FontAwesomeIcon className="w-2" icon={faArrowLeft} />
				<motion.p layout="position" className="text-xs text-inherit">
					Back
				</motion.p>
			</motion.div>
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
					Sign in to Cap
				</motion.h1>
				<motion.p
					key="subtitle"
					layout="position"
					className="text-[16px] text-gray-10"
				>
					Beautiful screen recordings, owned by you.
				</motion.p>
			</motion.div>
			<motion.div layout="position" className="flex flex-col space-y-3">
				<Suspense
					fallback={
						<>
							<Button disabled={true} variant="primary" />
							<Button disabled={true} variant="destructive" />
							<div className="mx-auto w-3/4 h-5 rounded-lg bg-gray-1" />
						</>
					}
				>
					<motion.div layout className="flex flex-col space-y-3">
						<AnimatePresence mode="wait" initial={false}>
							<motion.div
								key={showOrgInput ? "sso-wrapper" : "email-wrapper"}
								layout
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{
									duration: 0.25,
									ease: "easeInOut",
									opacity: { delay: 0.05 },
								}}
								className="px-1"
							>
								{showOrgInput ? (
									<motion.div
										key="sso"
										layout
										className="min-w-fit"
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
										exit={{ opacity: 0, y: -10, transition: { duration: 0.1 } }}
										transition={{ duration: 0.2, ease: "easeInOut" }}
									>
										<LoginWithSSO
											handleOrganizationLookup={handleOrganizationLookup}
											organizationId={organizationId}
											setOrganizationId={setOrganizationId}
											organizationName={organizationName}
										/>
									</motion.div>
								) : (
									<motion.form
										key="email"
										layout
										initial={{ opacity: 0, y: 10 }}
										animate={{
											opacity: 1,
											y: 0,
											transition: { duration: 0.1 },
										}}
										exit={{
											opacity: 0,
											y: -10,
											transition: { duration: 0.15 },
										}}
										transition={{
											duration: 0.2,
											ease: "easeInOut",
											opacity: { delay: 0.05 },
										}}
										noValidate
										onSubmit={async (e) => {
											e.preventDefault();

											if (step === "email") {
												setLoading(true);
												const normalizedEmail = email.trim().toLowerCase();

												try {
													await requestOtp(normalizedEmail);
													setStep("code");
												} catch (err) {
													toast.error(
														err instanceof Error
															? err.message
															: "Failed to send code — try again.",
													);
												} finally {
													setLoading(false);
												}
												return;
											}

											setLoading(true);
											const normalizedEmail = email.trim().toLowerCase();

											const res = await signIn("email-otp", {
												email: normalizedEmail,
												code,
												redirect: false,
											});

											setLoading(false);

											if (res?.ok && !res?.error) {
												router.push(
													next && next.length > 0 ? next : "/dashboard",
												);
												return;
											}

											toast.error("Invalid or expired code.");
										}}
										className="flex flex-col space-y-3"
									>
										<NormalLogin
											setShowOrgInput={setShowOrgInput}
											email={email}
											setEmail={setEmail}
											loading={loading}
											oauthError={oauthError}
											handleGoogleSignIn={handleGoogleSignIn}
											step={step}
											setStep={setStep}
											code={code}
											setCode={setCode}
										/>
									</motion.form>
								)}
							</motion.div>
						</AnimatePresence>
						<motion.p
							layout="position"
							className="pt-3 text-xs text-center text-gray-9"
						>
							By typing your email and clicking continue, you acknowledge that
							you have both read and agree to Cap's{" "}
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
				</Suspense>
			</motion.div>
		</motion.div>
	);
}

const LoginWithSSO = ({
	handleOrganizationLookup,
	organizationId,
	setOrganizationId,
	organizationName,
}: {
	handleOrganizationLookup: (e: React.FormEvent) => void;
	organizationId: string;
	setOrganizationId: (organizationId: string) => void;
	organizationName: string | null;
}) => {
	const organizationIdInputId = useId();

	return (
		<motion.form
			layout
			onSubmit={handleOrganizationLookup}
			className="relative space-y-2"
		>
			<MotionInput
				id={organizationIdInputId}
				placeholder="Enter your Organization ID..."
				value={organizationId}
				onChange={(e) => setOrganizationId(e.target.value)}
				className="w-full max-w-full"
			/>
			{organizationName && (
				<p className="text-sm text-gray-1">Signing in to: {organizationName}</p>
			)}
			<div>
				<Button type="submit" variant="dark" className="w-full max-w-full">
					Continue with SSO
				</Button>
			</div>
		</motion.form>
	);
};

const NormalLogin = ({
	setShowOrgInput,
	email,
	setEmail,
	loading,
	oauthError,
	handleGoogleSignIn,
	step,
	setStep,
	code,
	setCode,
}: {
	setShowOrgInput: (show: boolean) => void;
	email: string;
	setEmail: (email: string) => void;
	loading: boolean;
	oauthError: boolean;
	handleGoogleSignIn: () => void;
	step: "email" | "code";
	setStep: (step: "email" | "code") => void;
	code: string;
	setCode: (code: string) => void;
}) => {
	const publicEnv = usePublicEnv();
	const emailInputId = useId();
	const codeInputId = useId();

	return (
		<motion.div>
			<motion.div layout className="flex flex-col space-y-3">
				<AnimatePresence mode="wait" initial={false}>
					{step === "email" ? (
						<motion.div
							key="email-input"
							layout
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0, transition: { duration: 0.15 } }}
							exit={{ opacity: 0, y: -10, transition: { duration: 0.1 } }}
							className="flex flex-col space-y-3"
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
								onChange={(e) => {
									setEmail(e.target.value.toLowerCase());
								}}
							/>
							<MotionButton
								variant="dark"
								type="submit"
								disabled={loading}
								spinner={loading}
								icon={
									loading ? undefined : (
										<FontAwesomeIcon
											className="mr-1 size-4"
											icon={faEnvelope}
										/>
									)
								}
							>
								{loading ? "Sending code..." : "Continue with email"}
							</MotionButton>
						</motion.div>
					) : (
						<motion.div
							key="code-input"
							layout
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0, transition: { duration: 0.15 } }}
							exit={{ opacity: 0, y: -10, transition: { duration: 0.1 } }}
							className="flex flex-col space-y-3"
						>
							<motion.p
								layout="position"
								className="text-sm text-center text-gray-10"
							>
								Enter the 6-digit code from your server logs
							</motion.p>
							<MotionInput
								id={codeInputId}
								name="code"
								autoFocus
								type="text"
								inputMode="numeric"
								maxLength={6}
								pattern="[0-9]*"
								placeholder="123456"
								required
								value={code}
								disabled={loading}
								onChange={(e) => {
									setCode(e.target.value.replace(/\D/g, ""));
								}}
							/>
							<MotionButton
								variant="dark"
								type="submit"
								disabled={loading || code.length < 6}
								spinner={loading}
							>
								{loading ? "Verifying..." : "Verify code"}
							</MotionButton>
							<motion.button
								layout="position"
								type="button"
								onClick={() => {
									setStep("email");
									setCode("");
								}}
								className="text-xs text-center text-gray-9 hover:text-gray-12 transition-colors"
							>
								← Use a different email
							</motion.button>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
			{step === "email" && (
				<motion.p
					layout="position"
					className="mt-3 mb-2 text-xs text-center text-gray-9"
				>
					Don't have an account?{" "}
					<Link
						href="/signup"
						className="text-xs font-semibold text-blue-9 hover:text-blue-8"
					>
						Sign up here
					</Link>
				</motion.p>
			)}

			{(publicEnv.googleAuthAvailable || publicEnv.workosAuthAvailable) && (
				<>
					<div className="flex gap-4 items-center mt-4 mb-4">
						<span className="flex-1 h-px bg-gray-5" />
						<p className="text-sm text-center text-gray-10">OR</p>
						<span className="flex-1 h-px bg-gray-5" />
					</div>
					<motion.div
						layout
						className="flex flex-col gap-3 justify-center items-center"
					>
						{publicEnv.googleAuthAvailable && !oauthError && (
							<MotionButton
								variant="gray"
								type="button"
								className="flex gap-2 justify-center items-center w-full text-sm"
								onClick={handleGoogleSignIn}
								disabled={loading}
							>
								<Image src="/google.svg" alt="Google" width={16} height={16} />
								Login with Google
							</MotionButton>
						)}

						{oauthError && (
							<div className="flex gap-3 items-center p-3 bg-red-400 rounded-xl border border-red-600">
								<FontAwesomeIcon
									className="text-gray-50 size-8"
									icon={faExclamationCircle}
								/>
								<p className="text-xs leading-5 text-gray-50">
									It looks like you've previously used this email to sign up via
									email login. Please enter your email.
								</p>
							</div>
						)}
						{publicEnv.workosAuthAvailable && (
							<MotionButton
								variant="gray"
								type="button"
								className="w-full"
								layout
								onClick={() => setShowOrgInput(true)}
								disabled={loading}
							>
								<LucideArrowUpRight size={20} />
								Login with SAML SSO
							</MotionButton>
						)}
					</motion.div>
				</>
			)}
		</motion.div>
	);
};
