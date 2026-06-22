"use client";

import type { Video } from "@cap/web-domain";
import { Comment } from "@cap/web-domain";
import { faComment, faEye, faSmile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import {
	forwardRef,
	Suspense,
	startTransition,
	use,
	useEffect,
	useMemo,
	useState,
} from "react";
import { getVideoAnalytics } from "@/actions/videos/get-analytics";
import { newComment } from "@/actions/videos/new-comment";
import type { OrganizationSettings } from "@/app/(org)/dashboard/dashboard-data";
import { useCurrentUser } from "@/app/Layout/AuthContext";
import type { CommentType } from "../Share";
import type { VideoData } from "../types";
import { AuthOverlay } from "./AuthOverlay";
import { MeetingCostPanel } from "./panels/MeetingCostPanel";
import { Comments } from "./tabs/Activity/Comments";

type AiGenerationStatus =
	| "QUEUED"
	| "PROCESSING"
	| "COMPLETE"
	| "ERROR"
	| "SKIPPED";

interface SidebarProps {
	data: VideoData;
	commentsData: CommentType[];
	optimisticComments: CommentType[];
	handleCommentSuccess: (comment: CommentType) => void;
	setOptimisticComments: (newComment: CommentType) => void;
	setCommentsData: React.Dispatch<React.SetStateAction<CommentType[]>>;
	views: MaybePromise<number>;
	onSeek?: (time: number) => void;
	videoSettings?: OrganizationSettings | null;
	videoId: Video.VideoId;
	aiData?: {
		title?: string | null;
		summary?: string | null;
		chapters?: { title: string; start: number }[] | null;
		aiGenerationStatus?: AiGenerationStatus | null;
	} | null;
	aiGenerationEnabled?: boolean;
	disableReactions?: boolean;
}

const REACTIONS = [
	{ emoji: "😂", label: "joy" },
	{ emoji: "😍", label: "love" },
	{ emoji: "😮", label: "wow" },
	{ emoji: "🙌", label: "yay" },
	{ emoji: "👍", label: "up" },
	{ emoji: "👎", label: "down" },
];

const SidebarAnalytics = ({
	videoId,
	views,
	comments,
	isOwner,
}: {
	videoId: string;
	views: MaybePromise<number>;
	comments: CommentType[];
	isOwner: boolean;
}) => {
	const [viewCount, setViewCount] = useState(
		views instanceof Promise ? use(views) : views,
	);

	useEffect(() => {
		getVideoAnalytics(videoId)
			.then((r) => setViewCount(r.count))
			.catch(console.error);
	}, [videoId]);

	const totalComments = useMemo(
		() => comments.filter((c) => c.type === "text").length,
		[comments],
	);
	const totalReactions = useMemo(
		() => comments.filter((c) => c.type === "emoji").length,
		[comments],
	);

	return (
		<div className="flex flex-wrap gap-4 items-center justify-between px-4 py-3"
			style={{ borderBottom: "1px solid #e9edf3" }}>
			<div className="flex gap-4 items-center">
				<div className="flex gap-2 items-center">
					<FontAwesomeIcon className="text-gray-8 size-4" icon={faEye} />
					<span className="text-sm text-gray-12">{viewCount}</span>
				</div>
				<div className="flex gap-2 items-center">
					<FontAwesomeIcon className="text-gray-8 size-4" icon={faComment} />
					<span className="text-sm text-gray-12">{totalComments}</span>
				</div>
				<div className="flex gap-2 items-center">
					<FontAwesomeIcon className="text-gray-8 size-4" icon={faSmile} />
					<span className="text-sm text-gray-12">{totalReactions}</span>
				</div>
			</div>
			{isOwner && (
				<Link
					href={`/dashboard/analytics?capId=${videoId}`}
					className="text-xs text-blue-600 hover:underline"
				>
					View analytics
				</Link>
			)}
		</div>
	);
};

const ReactionsBlock = ({
	reactions,
	onReact,
}: {
	reactions: Record<string, number>;
	onReact: (emoji: string) => void;
}) => (
	<div className="flex flex-wrap gap-2 p-4"
		style={{ borderTop: "1px solid #e9edf3" }}>
		{REACTIONS.map(({ emoji, label }) => (
			<button
				key={emoji}
				type="button"
				aria-label={label}
				onClick={() => onReact(emoji)}
				className="inline-flex items-center gap-1.5 rounded-full transition-colors text-sm font-emoji"
				style={{ padding: "6px 12px", background: "#f7f9fc", border: "1px solid #e9edf3", borderRadius: "999px" }}
			>
				<span role="img" aria-label={label}>
					{emoji}
				</span>
				{reactions[emoji] != null && reactions[emoji] > 0 && (
					<span className="text-xs text-gray-9 font-sans">
						{reactions[emoji]}
					</span>
				)}
			</button>
		))}
	</div>
);

export const Sidebar = forwardRef<{ scrollToBottom: () => void }, SidebarProps>(
	(
		{
			data,
			setCommentsData,
			optimisticComments,
			handleCommentSuccess,
			setOptimisticComments,
			views,
			videoSettings,
			onSeek,
			videoId,
			disableReactions,
		},
		ref,
	) => {
		const user = useCurrentUser();
		const [showAuthOverlay, setShowAuthOverlay] = useState(false);

		// Guest name — shared localStorage key "365_guest_name" mirrors Comments.tsx.
		const [guestName, setGuestName] = useState<string>(() => {
			if (typeof window === "undefined") return "";
			try {
				return localStorage.getItem("365_guest_name") ?? "";
			} catch {
				return "";
			}
		});

		const isOwner = Boolean(user?.id === data.owner.id);
		const isOwnerOrMember = Boolean(
			isOwner || (user && data.organizationMembers?.includes(user.id)),
		);

		const commentsDisabled =
			videoSettings?.disableComments ??
			data.orgSettings?.disableComments ??
			false;
		const canReact = !(disableReactions ?? false);

		const reactionsByEmoji = useMemo(() => {
			const map: Record<string, number> = {};
			for (const c of optimisticComments) {
				if (c.type !== "emoji") continue;
				map[c.content] = (map[c.content] ?? 0) + 1;
			}
			return map;
		}, [optimisticComments]);

		const handleEmojiReact = async (emoji: string) => {
			if (!canReact) return;
			if (!user) {
				let theName = guestName.trim();
				if (!theName) {
					const prompted = window.prompt("Enter your name to react");
					if (!prompted || !prompted.trim()) return;
					theName = prompted.trim().slice(0, 50);
					setGuestName(theName);
					try {
						localStorage.setItem("365_guest_name", theName);
					} catch {
						// ignore
					}
				}
				// Guest reaction path
				const videoElement = document.querySelector("video") as HTMLVideoElement;
				const currentTime = videoElement?.currentTime ?? 0;
				const optimisticComment: CommentType = {
					id: Comment.CommentId.make(`temp-emoji-${Date.now()}`),
					authorId: null,
					authorName: theName,
					authorImage: null,
					content: emoji,
					createdAt: new Date(),
					videoId: data.id,
					parentCommentId: Comment.CommentId.make(""),
					type: "emoji",
					timestamp: currentTime,
					updatedAt: new Date(),
					sending: true,
				};
				startTransition(() => {
					setOptimisticComments(optimisticComment);
				});
				try {
					const result = await newComment({
						content: emoji,
						videoId: data.id,
						authorImage: null,
						parentCommentId: Comment.CommentId.make(""),
						type: "emoji",
						timestamp: currentTime,
						guestName: theName,
					});
					startTransition(() => {
						handleCommentSuccess(result);
					});
				} catch (error) {
					console.error("Error posting reaction:", error);
				}
				return;
			}
			const videoElement = document.querySelector("video") as HTMLVideoElement;
			const currentTime = videoElement?.currentTime ?? 0;

			const optimisticComment: CommentType = {
				id: Comment.CommentId.make(`temp-emoji-${Date.now()}`),
				authorId: user.id,
				authorName: user.name,
				authorImage: user.imageUrl,
				content: emoji,
				createdAt: new Date(),
				videoId: data.id,
				parentCommentId: Comment.CommentId.make(""),
				type: "emoji",
				timestamp: currentTime,
				updatedAt: new Date(),
				sending: true,
			};

			startTransition(() => {
				setOptimisticComments(optimisticComment);
			});

			try {
				const result = await newComment({
					content: emoji,
					videoId: data.id,
					authorImage: user.imageUrl,
					parentCommentId: Comment.CommentId.make(""),
					type: "emoji",
					timestamp: currentTime,
				});
				startTransition(() => {
					handleCommentSuccess(result);
				});
			} catch (error) {
				console.error("Error posting reaction:", error);
			}
		};

		return (
			<div
				className="flex flex-col gap-3"
				style={{ width: "100%", position: "sticky", top: "1rem" }}
			>
				{/* Processing cost is internal billing info — show it only to the
				    owner/org members, never to viewers (students/clients) who open
				    the share link. */}
				{isOwnerOrMember && (
					<div
						style={{
							borderRadius: "14px",
							background: "linear-gradient(135deg, #eef4ff 0%, #f7f9fc 100%)",
							border: "1px solid rgba(37, 99, 235, .15)",
							boxShadow:
								"0 1px 2px rgba(15,23,42,.06), 0 2px 6px rgba(15,23,42,.07)",
							backdropFilter: "blur(8px)",
							WebkitBackdropFilter: "blur(8px)",
							overflow: "hidden",
						}}
					>
						<MeetingCostPanel videoId={data.id} />
					</div>
				)}

				<div className="overflow-hidden flex flex-col" style={{
					background: "#fff",
					border: "1px solid #e9edf3",
					borderRadius: "16px",
					boxShadow: "0 2px 6px rgba(15,23,42,.06), 0 8px 20px rgba(15,23,42,.10), 0 16px 32px -8px rgba(15,23,42,.08)",
				}}>
					<div className="flex items-center px-4 py-3"
						style={{ borderBottom: "1px solid #e9edf3" }}>
						<span className="text-sm font-semibold text-gray-12">Activity</span>
					</div>

					{user && isOwnerOrMember && (
						<Suspense fallback={null}>
							<SidebarAnalytics
								videoId={data.id}
								views={views}
								comments={optimisticComments}
								isOwner={isOwner}
							/>
						</Suspense>
					)}

					<div className="flex flex-col flex-1 min-h-0 overflow-hidden">
						<Comments
							ref={ref}
							handleCommentSuccess={handleCommentSuccess}
							optimisticComments={optimisticComments}
							setOptimisticComments={setOptimisticComments}
							setComments={setCommentsData}
							videoId={videoId}
							setShowAuthOverlay={setShowAuthOverlay}
							onSeek={onSeek}
							commentsDisabled={commentsDisabled}
							videoOwnerId={data.owner.id}
						/>
					</div>

					{canReact && (
						<ReactionsBlock
							reactions={reactionsByEmoji}
							onReact={handleEmojiReact}
						/>
					)}

					<AuthOverlay
						isOpen={showAuthOverlay}
						onClose={() => setShowAuthOverlay(false)}
					/>
				</div>
			</div>
		);
	},
);
