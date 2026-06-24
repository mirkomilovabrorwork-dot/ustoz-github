"use client";

import { Button, Input, LogoBadge } from "@cap/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import {
	validateInviteToken,
	redeemInvite,
} from "@/actions/auth/invite";

export function ClaimInvite({ token }: { token: string }) {
	const router = useRouter();
	const [status, setStatus] = useState<
		"loading" | "valid" | "invalid"
	>("loading");
	const [inviteEmail, setInviteEmail] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState("");

	// Form state
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const nameInputId = useId();
	const emailInputId = useId();
	const passwordInputId = useId();
	const confirmPasswordInputId = useId();

	useEffect(() => {
		validateInviteToken(token).then((result) => {
			if (result.valid) {
				setStatus("valid");
				setInviteEmail(result.email);
				if (result.email) {
					setEmail(result.email);
				}
			} else {
				setStatus("invalid");
				setErrorMessage(result.error);
			}
		});
	}, [token]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setFormError(null);

		if (password.length < 8) {
			setFormError("Password must be at least 8 characters.");
			return;
		}

		if (password !== confirmPassword) {
			setFormError("Passwords do not match.");
			return;
		}

		setSubmitting(true);

		try {
			const result = await redeemInvite(
				token,
				name.trim(),
				email.trim().toLowerCase(),
				password,
			);

			if (!result.success) {
				setFormError(result.error);
				setSubmitting(false);
				return;
			}

			// Auto-login with credentials
			const signInRes = await signIn("credentials", {
				email: email.trim().toLowerCase(),
				password,
				redirect: false,
			});

			if (signInRes?.ok && !signInRes?.error) {
				router.push("/dashboard");
			} else {
				// Account created but auto-login failed; redirect to login
				router.push("/login");
			}
		} catch {
			setFormError("Something went wrong. Please try again.");
			setSubmitting(false);
		}
	};

	if (status === "loading") {
		return (
			<div className="text-gray-10">Verifying invite link...</div>
		);
	}

	if (status === "invalid") {
		return (
			<div className="w-[calc(100%-5%)] p-[28px] max-w-[432px] bg-gray-3 border border-gray-5 rounded-2xl text-center">
				<LogoBadge className="size-12 mx-auto" />
				<h1 className="text-xl font-semibold text-gray-12 mt-7 mb-2">
					Invite unavailable
				</h1>
				<p className="text-gray-10">{errorMessage}</p>
				<Link
					href="/login"
					className="text-sm font-semibold text-blue-9 hover:text-blue-8 mt-4 inline-block"
				>
					Go to login
				</Link>
			</div>
		);
	}

	return (
		<div className="w-[calc(100%-5%)] p-[28px] max-w-[432px] bg-gray-3 border border-gray-5 rounded-2xl">
			<Link className="flex mx-auto size-fit" href="/">
				<LogoBadge className="size-12" />
			</Link>
			<div className="flex flex-col justify-center items-center my-7 text-left">
				<h1 className="text-2xl font-semibold text-gray-12">
					Create your account
				</h1>
				<p className="text-[16px] text-gray-10">
					You've been invited to join data365.
				</p>
			</div>
			<div className="flex flex-col space-y-3">
				<form onSubmit={handleSubmit} className="flex flex-col space-y-3 px-1">
					<Input
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
					<Input
						id={emailInputId}
						name="email"
						type="email"
						placeholder="tim@apple.com"
						autoComplete="email"
						required
						value={email}
						disabled={submitting || !!inviteEmail}
						onChange={(e) => setEmail(e.target.value.toLowerCase())}
					/>
					<Input
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
					<Input
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
					{formError && (
						<p className="text-sm text-red-500 text-center">{formError}</p>
					)}
					<Button
						variant="dark"
						type="submit"
						disabled={submitting}
						spinner={submitting}
					>
						{submitting ? "Creating account..." : "Create Account"}
					</Button>
				</form>
				<p className="mt-3 mb-2 text-xs text-center text-gray-9">
					Already have an account?{" "}
					<Link
						href="/login"
						className="text-xs font-semibold text-blue-9 hover:text-blue-8"
					>
						Sign in here
					</Link>
				</p>
				<p className="pt-3 text-xs text-center text-gray-9">
					By creating an account, you acknowledge that you have both read and
					agree to data365's{" "}
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
				</p>
			</div>
		</div>
	);
}
