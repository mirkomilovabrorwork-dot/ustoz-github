"use client";

import { useEffect, useState } from "react";

type Status =
	| { kind: "loading" }
	| { kind: "success"; email: string; fallbackToken?: string }
	| { kind: "error"; message: string; token: string };

export function CallbackClient({
	extensionId,
}: {
	extensionId: string | undefined;
}) {
	const [status, setStatus] = useState<Status>({ kind: "loading" });
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function run() {
			try {
				const res = await fetch("/api/extension/mint-key", {
					method: "POST",
					credentials: "include",
				});
				if (res.status === 401) {
					const here = window.location.pathname + window.location.search;
					window.location.href = `/login?next=${encodeURIComponent(here)}`;
					return;
				}
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(
						(body as { error?: string }).error ?? "Failed to mint key",
					);
				}
				const { token, email } = (await res.json()) as {
					token: string;
					email: string;
				};

				if (cancelled) return;

				const chromeRuntime =
					typeof globalThis !== "undefined" &&
					typeof (globalThis as Record<string, unknown>).chrome === "object" &&
					(globalThis as Record<string, unknown>).chrome !== null
						? (
								(globalThis as Record<string, unknown>).chrome as Record<
									string,
									unknown
								>
							).runtime
						: undefined;

				if (
					chromeRuntime &&
					typeof (chromeRuntime as Record<string, unknown>).sendMessage ===
						"function" &&
					extensionId
				) {
					try {
						await new Promise<void>((resolve, reject) => {
							(
								chromeRuntime as {
									sendMessage: (
										extensionId: string,
										message: Record<string, unknown>,
										callback: (response: unknown) => void,
									) => void;
									lastError?: { message: string };
								}
							).sendMessage(
								extensionId,
								{
									type: "CAP_EXTENSION_TOKEN",
									token,
									apiBaseUrl: window.location.origin,
								},
								(_response: unknown) => {
									const rt = chromeRuntime as {
										lastError?: { message: string };
									};
									if (rt.lastError) {
										reject(new Error(rt.lastError.message));
									} else {
										resolve();
									}
								},
							);
						});
						setStatus({ kind: "success", email, fallbackToken: token });
						return;
					} catch (err) {
						if (cancelled) return;
						const raw =
							err instanceof Error
								? err.message
								: "Failed to connect to extension";
						const errorMsg =
							raw.includes("not included") || raw.includes("origin")
								? `This page's origin (${window.location.origin}) is not allowed to message the extension. Copy the key below and paste it into the extension's Options page instead.`
								: raw;
						setStatus({
							kind: "error",
							message: errorMsg,
							token,
						});
						return;
					}
				}

				setStatus({ kind: "success", email, fallbackToken: token });
			} catch (err) {
				if (cancelled) return;
				setStatus({
					kind: "error",
					message: err instanceof Error ? err.message : "Something went wrong",
					token: "",
				});
			}
		}

		run();
		return () => {
			cancelled = true;
		};
	}, [extensionId]);

	if (status.kind === "loading") {
		return (
			<div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
				<div className="flex justify-center mb-4">
					<div className="w-8 h-8 border-4 border-gray-3 border-t-blue-600 rounded-full animate-spin" />
				</div>
				<h1 className="text-xl font-semibold text-gray-12 mb-2">
					Connecting Cap to your browser extension...
				</h1>
				<p className="text-gray-11 text-sm">Please wait</p>
			</div>
		);
	}

	if (status.kind === "error") {
		return (
			<div className="w-full max-w-md rounded-2xl bg-red-50 border border-red-200 p-8 shadow-lg text-center">
				<div className="flex justify-center mb-4">
					<div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
						<span className="text-red-600 font-bold">!</span>
					</div>
				</div>
				<h1 className="text-xl font-semibold text-red-600 mb-2">
					Couldn't reach the extension
				</h1>
				<p className="text-red-700 text-sm mb-6">{status.message}</p>

				<div className="mb-6 text-left">
					<p className="text-gray-11 text-sm mb-3">
						Copy this API key and paste it into your extension settings:
					</p>
					<code className="block bg-white border border-gray-3 rounded-lg px-4 py-3 text-sm font-mono text-gray-12 break-all select-all mb-3 border-red-200">
						{status.token}
					</code>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard.writeText(status.token).then(() => {
								setCopied(true);
								setTimeout(() => setCopied(false), 2000);
							});
						}}
						className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
					>
						{copied ? "Copied!" : "Copy key"}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
			<div className="flex justify-center mb-4">
				<div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
					<span className="text-green-600 text-lg">✓</span>
				</div>
			</div>
			<h1 className="text-xl font-semibold text-gray-12 mb-2">
				Extension connected
			</h1>
			<p className="text-gray-11 text-sm mb-4">
				Connected for {status.email}. If the extension didn&apos;t pick up the
				key automatically, copy it below and paste into the extension&apos;s
				Options page.
			</p>

			{status.fallbackToken && (
				<div className="mb-4">
					<code className="block bg-gray-3 rounded-lg px-4 py-3 text-sm font-mono text-gray-12 break-all select-all mb-2">
						{status.fallbackToken}
					</code>
					<button
						type="button"
						onClick={() => {
							const key = status.fallbackToken;
							if (!key) return;
							navigator.clipboard.writeText(key).then(() => {
								setCopied(true);
								setTimeout(() => setCopied(false), 2000);
							});
						}}
						className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
					>
						{copied ? "Copied!" : "Copy key"}
					</button>
				</div>
			)}
		</div>
	);
}
