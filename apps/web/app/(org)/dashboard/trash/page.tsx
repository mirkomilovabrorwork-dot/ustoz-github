import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { TrashPageClient } from "./TrashPageClient";

export const metadata: Metadata = { title: "Trash — data365" };

export default async function TrashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const trashedVideos = await db()
    .select({
      id: videos.id,
      name: videos.name,
      deletedAt: videos.deletedAt,
      ownerId: videos.ownerId,
    })
    .from(videos)
    .where(
      and(
        eq(videos.ownerId, user.id),
        eq(videos.orgId, user.activeOrganizationId),
        isNotNull(videos.deletedAt),
      ),
    )
    .orderBy(desc(videos.deletedAt));

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-12 mb-6">Trash</h1>
      <TrashPageClient videos={trashedVideos} />
    </div>
  );
}
