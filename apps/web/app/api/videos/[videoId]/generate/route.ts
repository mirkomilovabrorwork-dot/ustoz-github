import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizationMembers, organizations, videos } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getEffectiveOrganizationRole } from "@/lib/permissions/roles";
import { startAiGeneration } from "@/lib/generate-ai";
import { transcribeVideo } from "@/lib/transcribe";
import type { VideoMetadata } from "@cap/database/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const { videoId: rawVideoId } = await params;
    const videoId = rawVideoId as Video.VideoId;

    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [video] = await db()
      .select({ id: videos.id, ownerId: videos.ownerId, orgId: videos.orgId, transcriptionStatus: videos.transcriptionStatus, metadata: videos.metadata })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);

    if (!video) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    // Check admin/owner permission
    const isOwner = user.id === video.ownerId;
    let hasPermission = isOwner;

    if (!hasPermission && video.orgId) {
      const [orgAccess] = await db()
        .select({
          ownerId: organizations.ownerId,
          memberRole: organizationMembers.role,
        })
        .from(organizations)
        .leftJoin(
          organizationMembers,
          and(
            eq(organizationMembers.organizationId, organizations.id),
            eq(organizationMembers.userId, user.id),
          ),
        )
        .where(
          and(
            eq(organizations.id, video.orgId),
            isNull(organizations.tombstoneAt),
          ),
        )
        .limit(1);

      if (orgAccess) {
        const role = getEffectiveOrganizationRole({
          userId: user.id,
          ownerId: orgAccess.ownerId,
          memberRole: orgAccess.memberRole,
        });
        hasPermission = role === "owner" || role === "admin";
      }
    }

    if (!hasPermission) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // If transcription is still running, nothing to do yet
    if (video.transcriptionStatus === "PROCESSING") {
      return Response.json({ alreadyRunning: true });
    }

    // If transcription is COMPLETE, check whether AI generation still needs to run
    if (video.transcriptionStatus === "COMPLETE") {
      const metadata = (video.metadata as VideoMetadata) || {};
      const aiStatus = metadata.aiGenerationStatus;

      // AI already done
      if (aiStatus === "COMPLETE") {
        return Response.json({ alreadyRunning: true });
      }

      // AI in-flight
      if (aiStatus === "PROCESSING" || aiStatus === "QUEUED") {
        return Response.json({ alreadyRunning: true });
      }

      // Transcript done but AI missing or ERROR — start/retry AI generation
      const result = await startAiGeneration(videoId, video.ownerId);
      if (!result.success) {
        return Response.json({ error: result.message }, { status: 500 });
      }
      return Response.json({ started: true });
    }

    // Transcription not yet started — kick off the full pipeline
    const result = await transcribeVideo(videoId, video.ownerId, true);

    if (!result.success) {
      return Response.json({ error: result.message }, { status: 500 });
    }

    return Response.json({ started: true });
  } catch (error) {
    console.error("[generate/route] Unexpected error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
