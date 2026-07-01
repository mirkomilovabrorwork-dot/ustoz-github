"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/app/Layout/AuthContext";
import {
	formatSeconds,
	parseTimestampToSeconds,
} from "./ai-chat-timestamps";
import "./ai-chat.css";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

let msgIdCounter = 0;
function nextMsgId() {
	return `msg-${++msgIdCounter}`;
}

interface AIChatPopupProps {
	videoId: string;
	onVideoJump: (seconds: number) => void;
	onClose: () => void;
	isOpen?: boolean;
}

function splitByLineBreak(text: string, keyOffset: number): React.ReactNode[] {
	const lines = text.split("\n");
	const result: React.ReactNode[] = [];
	for (let n = 0; n < lines.length; n++) {
		if (n > 0) result.push(<br key={`br-${keyOffset}-${String(n)}`} />);
		result.push(lines[n]);
	}
	return result;
}

function renderBoldAndBreaks(
	text: string,
	keyOffset: number,
): React.ReactNode[] {
	const boldRegex = /\*\*(.+?)\*\*/g;
	const segments: React.ReactNode[] = [];
	let last = 0;
	let match: RegExpExecArray | null;
	let i = keyOffset;

	while (true) {
		match = boldRegex.exec(text);
		if (match === null) break;
		const before = text.slice(last, match.index);
		if (before) {
			segments.push(...splitByLineBreak(before, i));
			i++;
		}
		segments.push(
			<span key={`b-${i++}`} className="font-semibold">
				{match[1]}
			</span>,
		);
		last = match.index + match[0].length;
	}

	const tail = text.slice(last);
	if (tail) {
		segments.push(...splitByLineBreak(tail, i));
	}

	return segments;
}

function renderMessageContent(
	content: string,
	onVideoJump: (seconds: number) => void,
): React.ReactNode[] {
	const citationRegex = /\[(\d{1,3}:\d{2}(?::\d{2})?)\]/g;
	const parts: React.ReactNode[] = [];
	let last = 0;
	let match: RegExpExecArray | null;

	while (true) {
		match = citationRegex.exec(content);
		if (match === null) break;
		const before = content.slice(last, match.index);
		if (before) {
			parts.push(...renderBoldAndBreaks(before, parts.length));
		}
		const timestamp = match[1] ?? "";
		const seconds = parseTimestampToSeconds(timestamp);
		parts.push(
			<button
				key={`cite-${match.index}`}
				type="button"
				className="ai-citation"
				onClick={() => onVideoJump(seconds)}
			>
				{`[${formatSeconds(seconds)}]`}
			</button>,
		);
		last = match.index + match[0].length;
	}

	const tail = content.slice(last);
	if (tail) {
		parts.push(...renderBoldAndBreaks(tail, parts.length + 1000));
	}

	return parts;
}

function OrbIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path
				d="M12 7.5 13.4 11.2 17 12l-3.6 1L12 16.5 10.6 13 7 12l3.6-.8z"
				fill="currentColor"
				stroke="none"
			/>
			<circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
		</svg>
	);
}

function ChipSummaryIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M4 6h16M4 11h16M4 16h10" />
		</svg>
	);
}

function ChipTasksIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="m3 7 1.6 1.6L8 5" />
			<path d="m3 17 1.6 1.6L8 15" />
			<path d="M11 7h10M11 17h10" />
		</svg>
	);
}

function ChipEmailIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect x="3" y="5" width="18" height="14" rx="2.5" />
			<path d="m3.5 7 8.5 6 8.5-6" />
		</svg>
	);
}

function ChipDecisionsIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M12 2.6l2.5 1.85 3.1.05.05 3.1L19.4 10l-1.85 2.5.05 3.1-3.1.05L12 17.4l-2.5-1.85-3.1-.05-.05-3.1L4.6 10l1.85-2.5-.05-3.1 3.1-.05z" />
			<path d="m9.2 10.2 2 2 3.6-3.6" />
		</svg>
	);
}

const CHIP_ICONS = [
	<ChipSummaryIcon key="summary" />,
	<ChipTasksIcon key="tasks" />,
	<ChipEmailIcon key="email" />,
	<ChipDecisionsIcon key="decisions" />,
];

export function AIChatPopup({
	videoId,
	onVideoJump,
	onClose,
	isOpen = false,
}: AIChatPopupProps) {
	const t = useTranslations("share");
	const user = useCurrentUser();
	const pathname = usePathname();
	const QUICK_ACTIONS = [
		{
			label: t("aiQuickSummary"),
			query: "Give me a concise summary of this video.",
		},
		{
			label: t("aiQuickActionItems"),
			query: "What are the main action items and who is responsible?",
		},
		{
			label: t("aiQuickFollowUpEmail"),
			query: "Draft a follow-up email about the next steps.",
		},
		{
			label: t("aiQuickKeyPoints"),
			query: "What were the key decisions or points made?",
		},
	];
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);

	const resizeState = useRef<{
		startX: number;
		startY: number;
		startW: number;
		startH: number;
	} | null>(null);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose]);

	const messageCount = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional scroll trigger on message count and streaming state changes
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messageCount, isStreaming]);

	const adjustTextarea = () => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 90)}px`;
	};

	const sendMessage = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed || isStreaming) return;
			// Guests cannot use paid AI chat (server returns 401); the footer shows
			// a sign-in CTA instead, so never attempt a submit without a user.
			if (!user) return;

			const userMsg: Message = {
				id: nextMsgId(),
				role: "user",
				content: trimmed,
			};
			const nextMessages = [...messages, userMsg];
			setMessages(nextMessages);
			setInput("");
			if (textareaRef.current) textareaRef.current.style.height = "auto";
			setIsStreaming(true);

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			let assistantContent = "";

			try {
				const response = await fetch("/api/video/ai/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						videoId,
						messages: nextMessages.map((m) => ({
							role: m.role,
							content: m.content,
						})),
					}),
					signal: controller.signal,
				});

				if (!response.ok || !response.body) {
					let errorText = t("aiError");
					if (response.status === 403) {
						let body: { error?: string } = {};
						try {
							body = await response.clone().json();
						} catch {
							// non-JSON body — fall through to generic auth message
						}
						errorText =
							body.error === "ai_access_required"
								? t("aiProRequired")
								: t("aiAuthRequired");
					} else if (response.status === 401) {
						errorText = t("aiAuthRequired");
					} else if (response.status === 429) {
						errorText = t("aiBusy");
					}
					setMessages((prev) => [
						...prev,
						{
							id: nextMsgId(),
							role: "assistant",
							content: errorText,
						},
					]);
					return;
				}

				const assistantId = nextMsgId();
				setMessages((prev) => [
					...prev,
					{ id: assistantId, role: "assistant", content: "" },
				]);

				const reader = response.body.getReader();
				const decoder = new TextDecoder();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split("\n");

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (!trimmedLine.startsWith("data:")) continue;
						const payload = trimmedLine.slice(5).trim();
						if (payload === "[DONE]") break;

						try {
							const parsed = JSON.parse(payload) as {
								token?: string;
								error?: string;
							};
							if (parsed.error) {
								// Surface the server's error as the assistant reply instead
								// of leaving a blank/empty message.
								assistantContent = t("aiAnswerError", {
									error: parsed.error,
								});
								setMessages((prev) => {
									const updated = [...prev];
									const last = updated[updated.length - 1];
									if (last?.role === "assistant") {
										updated[updated.length - 1] = {
											...last,
											content: assistantContent,
										};
									}
									return updated;
								});
							} else if (parsed.token) {
								assistantContent += parsed.token;
								setMessages((prev) => {
									const updated = [...prev];
									const last = updated[updated.length - 1];
									if (last?.role === "assistant") {
										updated[updated.length - 1] = {
											...last,
											content: assistantContent,
										};
									}
									return updated;
								});
							}
						} catch {
							// non-JSON SSE lines skipped
						}
					}
				}
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					setMessages((prev) => [
						...prev,
						{
							id: nextMsgId(),
							role: "assistant",
							content: t("aiError"),
						},
					]);
				}
			} finally {
				setIsStreaming(false);
				abortRef.current = null;
			}
		},
		[videoId, messages, isStreaming, user, t],
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage(input);
		}
	};

	const onResizeMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		const el = popupRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		resizeState.current = {
			startX: e.clientX,
			startY: e.clientY,
			startW: rect.width,
			startH: rect.height,
		};

		const onMove = (ev: MouseEvent) => {
			if (!resizeState.current || !popupRef.current) return;
			const dx = resizeState.current.startX - ev.clientX;
			const dy = resizeState.current.startY - ev.clientY;
			const newW = Math.max(300, resizeState.current.startW + dx);
			const newH = Math.max(360, resizeState.current.startH + dy);
			popupRef.current.style.width = `${newW}px`;
			popupRef.current.style.height = `${newH}px`;
		};

		const onUp = () => {
			resizeState.current = null;
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};

		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	};

	const hasMessages = messages.length > 0;

	return (
		<div
			ref={popupRef}
			className={`ai-popup${isOpen ? " open" : ""}`}
			role="dialog"
			aria-label={t("aiDialogAriaLabel")}
			aria-hidden={!isOpen}
		>
			<div className="ai-tint-overlay" />
			<div className="ai-noise" />
			{/* biome-ignore lint/a11y/noStaticElementInteractions: resize handle is mouse-only by design */}
			<div className="ai-resize" onMouseDown={onResizeMouseDown} />

			<div className="ai-hd">
				<div className="orb-sm">
					<OrbIcon />
				</div>
				<div className="htxt">
					<div className="t">{t("aiChatTitle")}</div>
					<div className="s">
						<span className="live" />
						{t("aiContextLoaded")}
					</div>
				</div>
				<button
					type="button"
					className="ai-x"
					onClick={onClose}
					aria-label={t("aiCloseAriaLabel")}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						aria-hidden="true"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div className="ai-body">
				{!hasMessages && (
					<>
						<div className="ai-welcome">
							<div className="wt">
								{t.rich("aiWelcomeTitle", {
									emphasis: (chunks) => (
										<span className="grad">{chunks}</span>
									),
								})}
							</div>
							<div className="ws">{t("aiWelcomeSubtitle")}</div>
						</div>
						{user && (
							<div className="ai-chips">
								{QUICK_ACTIONS.map((action, idx) => (
									<button
										key={action.query}
										type="button"
										className="ai-chip"
										onClick={() => sendMessage(action.query)}
									>
										{CHIP_ICONS[idx]}
										{action.label}
									</button>
								))}
							</div>
						)}
					</>
				)}

				{messages.map((msg) => (
					<div
						key={msg.id}
						className={`ai-msg${msg.role === "user" ? " user" : " ai"}`}
					>
						{msg.role === "assistant" && (
							<div className="av">
								<OrbIcon />
							</div>
						)}
						<div className="bubble">
							{msg.role === "assistant"
								? renderMessageContent(msg.content, onVideoJump)
								: msg.content}
						</div>
					</div>
				))}

				{isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
					<div className="ai-msg ai">
						<div className="av">
							<OrbIcon />
						</div>
						<div className="ai-typing">
							<span />
							<span />
							<span />
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			<div className="ai-foot">
				{user ? (
					<>
						<div className="ai-inputbar">
							<textarea
								ref={textareaRef}
								rows={1}
								placeholder={t("aiPlaceholder")}
								value={input}
								onChange={(e) => {
									setInput(e.target.value);
									adjustTextarea();
								}}
								onKeyDown={handleKeyDown}
								disabled={isStreaming}
							/>
							<button
								type="button"
								className="ai-send"
								onClick={() => sendMessage(input)}
								disabled={!input.trim() || isStreaming}
								aria-label={t("aiSendAriaLabel")}
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.4"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M12 20V5" />
									<path d="m6 11 6-6 6 6" />
								</svg>
							</button>
						</div>
						<div className="ai-disclaimer">{t("aiDisclaimer")}</div>
					</>
				) : (
					<div className="px-4 py-3 text-center text-sm text-gray-11">
						<a
							href={`/login?next=${encodeURIComponent(pathname)}`}
							className="font-medium text-blue-11 hover:underline"
						>
							{t("aiAuthRequired")}
						</a>
					</div>
				)}
			</div>
		</div>
	);
}
