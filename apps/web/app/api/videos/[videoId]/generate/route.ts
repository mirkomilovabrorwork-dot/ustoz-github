import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizationMembers, organizations, videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import type { Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requestAiGenerationAfterTranscription } from "@/lib/ai-generation-request";
import { startAiGeneration } from "@/lib/generate-ai";
import { getEffectiveOrganizationRole } from "@/lib/permissions/roles";
import { transcribeVideo } from "@/lib/transcribe";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const { videoId: rawVideoId } = await params;
    const videoId = rawVideoId as Video.VideoId;

    // Owner/admin "Qayta analiz" (retry) re-runs AI on the EXISTING transcript
    // even when content already exists. No re-upload / re-transcription.
    let reprocess = false;
    try {
      const body = await request.json();
      reprocess = body?.reprocess === true;
    } catch {
      // no body → normal (non-forced) request
    }

    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [video] = await db()
      .select({ id: videos.id, ownerId: videos.ownerId, orgId: videos.orgId, transcriptionStatus: videos.transcriptionStatus, metadata: videos.metadata })
      .from(videos)
      .where(and(eq(videos.id, videoId), isNull(videos.deletedAt)))
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

    // If transcription is still running, remember the user's explicit AI
    // request so the workflow starts AI analysis as soon as the transcript
    // finishes. Do not set aiGenerationStatus=QUEUED here: startAiGeneration
    // uses that status to mean a real AI workflow has already been launched.
    if (video.transcriptionStatus === "PROCESSING") {
      const metadata = (video.metadata as VideoMetadata) || {};
      await db()
        .update(videos)
        .set({
          metadata: requestAiGenerationAfterTranscription({
            metadata,
            requestedAt: new Date().toISOString(),
            requestedBy: user.id,
          }),
        })
        .where(eq(videos.id, videoId));

      return Response.json({ alreadyRunning: true, queuedAfterTranscription: true });
    }

    // If transcription is COMPLETE, check whether AI generation still needs to run
    if (video.transcriptionStatus === "COMPLETE") {
      const metadata = (video.metadata as VideoMetadata) || {};
      const aiStatus = metadata.aiGenerationStatus;

      // AI already done — only if real content is present (summary or aiSummary).
      // If status is COMPLETE but content is missing/empty, fall through to retry.
      if (aiStatus === "COMPLETE" && !reprocess) {
        const hasContent =
          (typeof metadata.summary === "string" && metadata.summary.length > 0) ||
          (metadata.aiSummary != null &&
            typeof metadata.aiSummary === "object" &&
            typeof (metadata.aiSummary as { overview?: unknown }).overview === "string" &&
            ((metadata.aiSummary as { overview: string }).overview.length > 0));
        if (hasContent) {
          return Response.json({ alreadyRunning: true });
        }
        // COMPLETE but empty — fall through to startAiGeneration below
      }

      // AI in-flight (a forced reprocess must still wait for the running job)
      if (aiStatus === "PROCESSING" || aiStatus === "QUEUED") {
        return Response.json({ alreadyRunning: true });
      }

      // Transcript done but AI missing / ERROR, or an owner-forced reprocess —
      // start/retry AI generation on the existing transcript.
      const result = await startAiGeneration(videoId, video.ownerId, {
        force: reprocess,
      });
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
