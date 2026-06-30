import { Comment, User, type Video } from "@cap/web-domain";
import { faCommentSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSearchParams } from "next/navigation";
import type React from "react";
import {
	type ComponentProps,
	forwardRef,
	type PropsWithChildren,
	startTransition,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { deleteComment } from "@/actions/videos/delete-comment";
import { newComment } from "@/actions/videos/new-comment";
import { useCurrentUser } from "@/app/Layout/AuthContext";
import type { CommentType } from "../../../Share";
import CommentComponent from "./Comment";
import CommentInput from "./CommentInput";
import EmptyState from "./EmptyState";

export const Comments = Object.assign(
	forwardRef<
		{ scrollToBottom: () => void },
		{
			setComments: React.Dispatch<React.SetStateAction<CommentType[]>>;
			videoId: Video.VideoId;
			optimisticComments: CommentType[];
			setOptimisticComments: (newComment: CommentType) => void;
			handleCommentSuccess: (comment: CommentType) => void;
			onSeek?: (time: number) => void;
			setShowAuthOverlay: (v: boolean) => void;
			commentsDisabled: boolean;
			videoOwnerId?: string | null;
		}
	>((props, ref) => {
		const {
			optimisticComments,
			setOptimisticComments,
			setComments,
			handleCommentSuccess,
			onSeek,
			commentsDisabled,
			videoOwnerId,
		} = props;
		const commentParams = useSearchParams().get("comment");
		const replyParams = useSearchParams().get("reply");
		const user = useCurrentUser();

		// Guest name — only relevant when !user. Seeded from localStorage so a name
		// entered once persists across page refreshes. Shared key "365_guest_name".
		const [guestName, setGuestName] = useState<string>(() => {
			if (typeof window === "undefined") return "";
			try {
				return localStorage.getItem("365_guest_name") ?? "";
			} catch {
				return "";
			}
		});

		const handleGuestNameChange = (v: string) => {
			setGuestName(v);
			try {
				localStorage.setItem("365_guest_name", v);
			} catch {
				// localStorage unavailable — ignore
			}
		};

		const [replyingTo, setReplyingTo] = useState<Comment.CommentId | null>(
			null,
		);

		const commentsContainerRef = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (commentParams || replyParams) return;
			if (commentsContainerRef.current) {
				commentsContainerRef.current.scrollTop =
					commentsContainerRef.current.scrollHeight;
			}
		}, [commentParams, replyParams]);

		const scrollToBottom = useCallback(() => {
			if (commentsContainerRef.current) {
				commentsContainerRef.current.scrollTo({
					top: commentsContainerRef.current.scrollHeight,
					behavior: "smooth",
				});
			}
		}, []);

		useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

		const rootComments = optimisticComments.filter(
			(comment) => !comment.parentCommentId || comment.parentCommentId === "",
		);

		const handleNewComment = async (content: string) => {
			if (!user && guestName.trim() === "") return;

			const videoElement = document.querySelector("video") as HTMLVideoElement;
			const currentTime = videoElement?.currentTime || 0;

			const optimisticComment: CommentType = {
				id: Comment.CommentId.make(`temp-${Date.now()}`),
				authorId: User.UserId.make(user ? user.id : "anonymous"),
				authorName: user ? user.name : guestName.trim(),
				authorImage: user ? user.imageUrl : null,
				content,
				createdAt: new Date(),
				videoId: props.videoId,
				parentCommentId: Comment.CommentId.make(""),
				type: "text",
				timestamp: currentTime,
				updatedAt: new Date(),
				sending: true,
			};

			startTransition(() => {
				setOptimisticComments(optimisticComment);
			});

			try {
				const data = await newComment({
					content,
					videoId: props.videoId,
					authorImage: user ? user.imageUrl : null,
					parentCommentId: Comment.CommentId.make(""),
					type: "text",
					timestamp: currentTime,
					guestName: user ? undefined : guestName.trim(),
				});
				handleCommentSuccess(data);
			} catch (error) {
				console.error("Error posting comment:", error);
			}
		};

		const handleReply = async (content: string) => {
			if (!replyingTo || !user) return;

			const videoElement = document.querySelector("video") as HTMLVideoElement;
			const currentTime = videoElement?.currentTime || 0;

			const parentComment = optimisticComments.find((c) => c.id === replyingTo);
			const actualParentId = parentComment?.parentCommentId
				? parentComment.parentCommentId
				: replyingTo;

			const optimisticReply: CommentType = {
				id: Comment.CommentId.make(`temp-reply-${Date.now()}`),
				authorId: user.id,
				authorName: user.name,
				authorImage: user.imageUrl,
				content,
				createdAt: new Date(),
				videoId: props.videoId,
				parentCommentId: actualParentId,
				type: "text",
				timestamp: currentTime,
				updatedAt: new Date(),
				sending: true,
			};

			startTransition(() => {
				setOptimisticComments(optimisticReply);
			});

			try {
				const data = await newComment({
					content,
					videoId: props.videoId,
					parentCommentId: actualParentId,
					type: "text",
					timestamp: currentTime,
					authorImage: user.imageUrl,
				});

				handleCommentSuccess(data);

				const newReplyElement = document.getElementById(`comment-${data.id}`);
				if (newReplyElement) {
					newReplyElement.scrollIntoView({
						behavior: "smooth",
						block: "center",
					});
				}
				setReplyingTo(null);
			} catch (error) {
				console.error("Error posting reply:", error);
			}
		};

		const handleCancelReply = () => {
			setReplyingTo(null);
		};

		const handleDeleteComment = async (
			commentId: Comment.CommentId,
			parentId: Comment.CommentId | null,
		) => {
			try {
				await deleteComment({
					commentId,
					parentId,
					videoId: props.videoId,
				});
				setComments((prev) => prev.filter((c) => c.id !== commentId));
			} catch (error) {
				console.error("Failed to delete comment:", error);
			}
		};

		const handleEditComment = (
			commentId: Comment.CommentId,
			newContent: string,
		) => {
			setComments((prev) =>
				prev.map((c) =>
					c.id === commentId
						? { ...c, content: newContent, updatedAt: new Date() }
						: c,
				),
			);
		};

		return (
			<Comments.Shell
				commentInputProps={{
					onSubmit: handleNewComment,
					disabled: commentsDisabled,
					showNameInput: !user,
					name: guestName,
					onNameChange: handleGuestNameChange,
				}}
				setShowAuthOverlay={props.setShowAuthOverlay}
				commentsContainerRef={commentsContainerRef}
			>
				{commentsDisabled ? (
					<div className="p-4 space-y-6 h-full">
						<EmptyState
							icon={<FontAwesomeIcon icon={faCommentSlash} />}
							commentsDisabled={commentsDisabled}
						/>
					</div>
				) : rootComments.length === 0 ? (
					<EmptyState />
				) : (
					<div className="p-4 space-y-6">
						<style>{`
							@keyframes comment-in {
								from { opacity: 0; transform: translateY(8px); }
								to   { opacity: 1; transform: translateY(0); }
							}
						`}</style>
						{rootComments.map((comment, index) => (
							<div
								key={comment.id}
								style={{
									animation: "comment-in 0.3s ease-out both",
									animationDelay: `${Math.min(index, 4) * 50}ms`,
								}}
							>
								<CommentComponent
									comment={comment}
									replies={optimisticComments}
									onReply={(id) => {
										if (!user) {
											props.setShowAuthOverlay(true);
										} else {
											setReplyingTo(id);
										}
									}}
									replyingToId={replyingTo}
									handleReply={handleReply}
									onCancelReply={handleCancelReply}
									onDelete={handleDeleteComment}
									onEditSuccess={handleEditComment}
									videoOwnerId={videoOwnerId}
									onSeek={onSeek}
								/>
							</div>
						))}
					</div>
				)}
			</Comments.Shell>
		);
	}),
	{
		Shell: (
			props: PropsWithChildren<{
				setShowAuthOverlay: (v: boolean) => void;
				commentInputProps?: Omit<
					ComponentProps<typeof CommentInput>,
					"user" | "placholder" | "buttonLabel"
				>;
				commentsContainerRef?: React.RefObject<HTMLDivElement | null>;
			}>,
		) => {
			return (
				<>
					<div
						ref={props.commentsContainerRef}
						className="overflow-y-auto flex-1 min-h-0 pb-16 lg:pr-16"
					>
						{props.children}
					</div>

					{!props.commentInputProps?.disabled && (
						<div className="flex-none border-t border-gray-4 bg-gray-2 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] lg:pb-2">
							<CommentInput
								{...props.commentInputProps}
								placeholder="Leave a comment"
								buttonLabel="Comment"
							/>
						</div>
					)}
				</>
			);
		},
		Skeleton: (props: { setShowAuthOverlay: (v: boolean) => void }) => (
			<Comments.Shell {...props} commentInputProps={{ disabled: true }} />
		),
	},
);
