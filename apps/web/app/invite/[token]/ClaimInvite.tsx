"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export function ClaimInvite({ token }: { token: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		signIn("invite-token", {
			token,
			callbackUrl: "/dashboard",
			redirect: false,
		}).then((res) => {
			if (res?.ok && !res?.error) {
				window.location.href = res.url ?? "/dashboard";
			} else {
				setError("This invite link is invalid, expired, or already used.");
			}
		});
	}, [token]);

	if (error) {
		return (
			<div className="p-6 max-w-md text-center">
				<h1 className="text-xl font-semibold mb-2">Invite unavailable</h1>
				<p className="text-gray-500">{error}</p>
				<a
					href="/login"
					className="text-blue-600 hover:underline mt-4 inline-block"
				>
					Go to login
				</a>
			</div>
		);
	}

	return <div className="text-gray-500">Signing you in…</div>;
}
