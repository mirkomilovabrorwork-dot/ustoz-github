"use client";

import { Button } from "@cap/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { permanentlyDeleteVideo } from "@/actions/videos/permanently-delete-video";
import { restoreVideo } from "@/actions/videos/restore-video";

interface TrashVideo {
  id: string;
  name: string;
  deletedAt: Date | null;
  ownerId: string;
}

interface TrashPageClientProps {
  videos: TrashVideo[];
}

export function TrashPageClient({ videos }: TrashPageClientProps) {
  const router = useRouter();

  if (videos.length === 0) {
    return (
      <p className="text-center text-gray-10 py-12">Trash is empty.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {videos.map((video) => {
        const daysAgo = Math.floor(
          (Date.now() - new Date(video.deletedAt!).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const daysLeft = Math.max(0, 7 - daysAgo);

        const handleRestore = async () => {
          try {
            await restoreVideo(video.id as any);
            toast.success("Video restored");
            router.refresh();
          } catch (e) {
            toast.error(String(e));
          }
        };

        const handleDeletePermanently = async () => {
          if (
            !window.confirm(
              "Permanently delete this video? This cannot be undone.",
            )
          ) {
            return;
          }
          try {
            await permanentlyDeleteVideo(video.id as any);
            toast.success("Video permanently deleted");
            router.refresh();
          } catch (e) {
            toast.error(String(e));
          }
        };

        return (
          <li
            key={video.id}
            className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-4 dark:border-gray-6"
          >
            <div className="flex flex-col min-w-0">
              <p className="font-semibold text-gray-12 truncate">{video.name}</p>
              <p className="text-sm text-gray-10 mt-0.5">
                Deleted {daysAgo} day{daysAgo !== 1 ? "s" : ""} ago &middot;{" "}
                {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="gray" size="sm" onClick={handleRestore}>
                Restore
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeletePermanently}
              >
                Delete permanently
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
