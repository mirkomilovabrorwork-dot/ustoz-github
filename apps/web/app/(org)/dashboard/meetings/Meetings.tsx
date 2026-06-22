"use client";

import type { Video } from "@cap/web-domain";
import { Effect, Exit } from "effect";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEffectMutation, useRpcClient } from "@/lib/EffectRuntime";
import { useVideosAnalyticsQuery } from "@/lib/Queries/Analytics";
import { useDashboardContext } from "../Contexts";
import type { VideoData } from "../caps/Caps";
import { SelectedCapsBar } from "../caps/components";
import { CapCard } from "../caps/components/CapCard/CapCard";
import { CapPagination } from "../caps/components/CapPagination";

export type MeetingVideoData = Omit<VideoData[number], "foldersData">;

export const Meetings = ({
	data,
	count,
	analyticsEnabled,
}: {
	data: MeetingVideoData[];
	count: number;
	analyticsEnabled: boolean;
}) => {
	const router = useRouter();
	const params = useSearchParams();
	const page = Number(params.get("page")) || 1;
	const { user } = useDashboardContext();
	const limit = 15;
	const totalPages = Math.ceil(count / limit);
	const bulkDeleteToastRef = useRef<string | number | undefined>(undefined);
	const [selectedCaps, setSelectedCaps] = useState<Video.VideoId[]>([]);

	const anyCapSelected = selectedCaps.length > 0;

	const analyticsQuery = useVideosAnalyticsQuery(
		data.map((video) => video.id),
		analyticsEnabled,
	);
	const analytics: Partial<Record<Video.VideoId, number>> =
		analyticsQuery.data || {};
	const isLoadingAnalytics = analyticsEnabled && analyticsQuery.isLoading;

	const handleCapSelection = (capId: Video.VideoId) => {
		setSelectedCaps((prev) =>
			prev.includes(capId)
				? prev.filter((id) => id !== capId)
				: [...prev, capId],
		);
	};

	const rpc = useRpcClient() as {
		VideoDelete: (id: Video.VideoId) => Effect.Effect<void, unknown, never>;
	};

	const { mutate: deleteCaps, isPending: isDeletingCaps } = useEffectMutation({
		mutationFn: Effect.fn(function* (ids: Video.VideoId[]) {
			if (ids.length === 0) return { success: 0 };

			const results = yield* Effect.all(
				ids.map((id) => rpc.VideoDelete(id).pipe(Effect.exit)),
				{ concurrency: 10 },
			);

			const successCount = results.filter(Exit.isSuccess).length;
			const errorCount = ids.length - successCount;

			if (successCount > 0 && errorCount > 0) {
				return { success: successCount, error: errorCount };
			} else if (successCount > 0) {
				return { success: successCount };
			} else {
				return yield* Effect.fail(
					new Error(
						`Failed to delete ${errorCount} cap${errorCount === 1 ? "" : "s"}`,
					),
				);
			}
		}),
		onMutate: (ids: Video.VideoId[]) => {
			bulkDeleteToastRef.current = toast.loading(
				`Deleting ${ids.length} cap${ids.length === 1 ? "" : "s"}...`,
			);
		},
		onSuccess: (result: { success: number; error?: number }) => {
			toast.dismiss(bulkDeleteToastRef.current);
			bulkDeleteToastRef.current = undefined;
			setSelectedCaps([]);
			router.refresh();
			if (result.error) {
				toast.success(
					`Successfully deleted ${result.success} cap${result.success === 1 ? "" : "s"}, but failed to delete ${result.error} cap${result.error === 1 ? "" : "s"}`,
				);
			} else {
				toast.success(
					`Successfully deleted ${result.success} cap${result.success === 1 ? "" : "s"}`,
				);
			}
		},
		onError: (error: unknown) => {
			toast.dismiss(bulkDeleteToastRef.current);
			bulkDeleteToastRef.current = undefined;
			const message =
				error instanceof Error
					? error.message
					: "An error occurred while deleting caps";
			toast.error(message);
		},
	});

	const { mutate: deleteCap, isPending: isDeletingCap } = useEffectMutation({
		mutationFn: Effect.fn(function* (id: Video.VideoId) {
			yield* rpc.VideoDelete(id);
		}),
		onSuccess: () => {
			toast.success("Recording deleted successfully");
			router.refresh();
		},
		onError: (_error: unknown) => toast.error("Failed to delete recording"),
	});

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && selectedCaps.length > 0) {
				setSelectedCaps([]);
			}

			if (
				(e.key === "Delete" || e.key === "Backspace") &&
				selectedCaps.length > 0
			) {
				if (e.key === "Backspace") {
					e.preventDefault();
				}

				if (
					!["INPUT", "TEXTAREA", "SELECT"].includes(
						document.activeElement?.tagName || "",
					)
				) {
					deleteCaps(selectedCaps);
				}
			}

			if (e.key === "a" && (e.ctrlKey || e.metaKey) && data.length > 0) {
				if (
					!["INPUT", "TEXTAREA", "SELECT"].includes(
						document.activeElement?.tagName || "",
					)
				) {
					e.preventDefault();
					setSelectedCaps(data.map((cap) => cap.id));
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [selectedCaps, data, deleteCaps]);

	const isEmpty = count === 0;

	return (
		<div className="flex relative flex-col w-full h-full">
			<div className="flex flex-wrap gap-3 items-center mb-10 w-full">
				<h1 className="text-2xl font-medium text-gray-12">
					Meeting Recordings
				</h1>
			</div>
			{isEmpty && (
				<div className="flex flex-col flex-1 justify-center items-center w-full h-full">
					<div className="flex flex-col gap-3 justify-center items-center h-full text-center">
						<div className="flex flex-col items-center px-5">
							<p className="mb-1 text-xl font-semibold text-gray-12">
								No meeting recordings yet
							</p>
							<p className="max-w-md text-gray-10 text-md">
								Install the data365 browser extension to start recording Google Meet
								calls.
							</p>
						</div>
						<Link
							href="/dashboard/extension"
							className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
						>
							Install Extension
						</Link>
					</div>
				</div>
			)}
			{data.length > 0 && (
				<div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
					{data.map((video) => {
						const videoAnalytics = analytics[video.id];
						return (
							<CapCard
								key={video.id}
								cap={video}
								analytics={videoAnalytics ?? 0}
								onDelete={() => {
									if (selectedCaps.length > 0) {
										deleteCaps(selectedCaps);
									} else {
										deleteCap(video.id);
									}
								}}
								userId={user?.id}
								isLoadingAnalytics={isLoadingAnalytics}
								isSelected={selectedCaps.includes(video.id)}
								anyCapSelected={anyCapSelected}
								onSelectToggle={() => handleCapSelection(video.id)}
							/>
						);
					})}
				</div>
			)}
			{(data.length > limit || data.length === limit || page !== 1) && (
				<div className="mt-7">
					<CapPagination currentPage={page} totalPages={totalPages} />
				</div>
			)}
			<SelectedCapsBar
				selectedCaps={selectedCaps}
				setSelectedCaps={setSelectedCaps}
				deleteSelectedCaps={() => deleteCaps(selectedCaps)}
				isDeleting={isDeletingCaps || isDeletingCap}
			/>
		</div>
	);
};
