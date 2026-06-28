/**
 * import-real-video.ts
 *
 * Inserts a real local MP4 file into the Cap database and uploads it to MinIO/S3
 * at the key the transcription pipeline expects: <userId>/<videoId>/result.mp4
 *
 * Key evidence:
 *   - apps/web/workflows/transcribe.ts:254 — `${userId}/${videoId}/result.mp4` is the
 *     first candidate key in resolveVideoSourceUrl; it's fetched with a range HEAD check.
 *   - source: { type: "local" } — same as seed-demo-video.ts; makes decodeStorageVideo
 *     produce no storageIntegrationId, so Storage.getAccessForVideo resolves to S3.
 *   - transcriptionStatus: null — pipeline triggers only when this is null (the auto-start
 *     logic on the share page checks for null and kicks off the workflow).
 *   - skipProcessing: false (default) — must not be set to skip the pipeline.
 *
 * Run:
 *   dotenv -e ../../.env -- tsx scripts/import-real-video.ts
 */

import { createReadStream, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
  organizationMembers,
  organizations,
  users,
  videos,
} from "@cap/database/schema";
import { and, eq, or } from "drizzle-orm";

const FFMPEG = "C:/Users/localhost/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe";
const TARGET_FILE = "C:/Users/localhost/Desktop/IMG_0546.MP4";
const TARGET_EMAIL = "admin@ustoz.uz";

// ── helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** Run ffmpeg -i <path> and parse "Duration: HH:MM:SS.ss" from stderr */
function probeDuration(filePath: string): number {
  let output = "";
  try {
    execSync(`"${FFMPEG}" -i "${filePath}" -hide_banner`, {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (err: any) {
    // ffmpeg always exits non-zero when given -i without output; capture stderr
    output = err.stderr?.toString() ?? "";
  }

  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match || !match[1] || !match[2] || !match[3]) {
    throw new Error(`Could not parse Duration from ffmpeg output:\n${output}`);
  }
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseFloat(match[3]);
  return h * 3600 + m * 60 + s;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Probe duration
  console.log(`Probing duration of ${TARGET_FILE} …`);
  const duration = probeDuration(TARGET_FILE);
  console.log(`Duration: ${duration.toFixed(2)}s`);

  // 2. Look up user
  const [user] = await db()
    .select()
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);

  if (!user) throw new Error(`No user found: ${TARGET_EMAIL}`);
  console.log(`User: ${user.id} (${user.email})`);

  // 3. First organization
  const userOrgs = await db()
    .select({ id: organizations.id })
    .from(organizations)
    .leftJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
    .where(
      or(
        eq(organizations.ownerId, user.id as any),
        eq(organizationMembers.userId, user.id as any),
      ),
    )
    .groupBy(organizations.id)
    .orderBy(organizations.createdAt);

  const orgId = userOrgs[0]?.id;
  if (!orgId) throw new Error(`User ${TARGET_EMAIL} has no organizations`);
  console.log(`OrgId: ${orgId}`);

  // 4. Generate videoId
  const videoId = nanoId();
  console.log(`VideoId: ${videoId}`);

  // 5. S3 key — must match what resolveVideoSourceUrl checks first (transcribe.ts:254)
  const s3Key = `${user.id}/${videoId}/result.mp4`;
  console.log(`S3 key: ${s3Key}`);

  // 6. Build S3 client directly (no Effect, no server-only)
  const bucket   = requireEnv("CAP_AWS_BUCKET");
  const endpoint = requireEnv("CAP_AWS_ENDPOINT");
  const region   = requireEnv("CAP_AWS_REGION");
  const accessKeyId     = requireEnv("CAP_AWS_ACCESS_KEY");
  const secretAccessKey = requireEnv("CAP_AWS_SECRET_KEY");

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,    // MinIO requires path-style
  });

  // 7. Upload the file
  const fileStats = statSync(TARGET_FILE);
  console.log(`Uploading ${(fileStats.size / 1024 / 1024).toFixed(1)} MB …`);

  const stream = createReadStream(TARGET_FILE);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: stream,
      ContentType: "video/mp4",
      ContentLength: fileStats.size,
    }),
  );
  console.log(`Upload complete: s3://${bucket}/${s3Key}`);

  // 8. Insert videos row
  //    - source: { type: "local" }  →  decodeStorageVideo produces no storageIntegrationId
  //      → Storage.getAccessForVideo uses the default S3 bucket (capso on MinIO)
  //    - transcriptionStatus: null  →  auto-transcription pipeline will trigger on page load
  //    - skipProcessing: false (drizzle default) — pipeline must NOT be skipped
  await db().insert(videos as any).values({
    id: videoId,
    name: "Ustoz brief — IMG_0546",
    ownerId: user.id,
    orgId,
    duration,
    source: { type: "local" },
    public: true,
    // transcriptionStatus deliberately omitted → stays NULL → pipeline will start
  });
  console.log(`Video row inserted: ${videoId}`);

  // 9. Verify: generate a presigned URL and probe with ffmpeg
  console.log("\nVerifying media accessibility via presigned URL …");
  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    { expiresIn: 3600 },
  );
  console.log(`Presigned URL: ${presignedUrl.slice(0, 120)}…`);

  let ffprobeOutput = "";
  try {
    execSync(`"${FFMPEG}" -i "${presignedUrl}" -hide_banner`, {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 30000,
    });
  } catch (err: any) {
    ffprobeOutput = err.stderr?.toString() ?? "";
  }

  const durationLine = ffprobeOutput.match(/Duration:[^\n]+/)?.[0] ?? "(not found)";
  const audioLine    = ffprobeOutput.match(/Audio:[^\n]+/)?.[0]    ?? "(not found — NO AUDIO DETECTED!)";

  console.log("\n=== ffmpeg probe result ===");
  console.log("Duration line :", durationLine);
  console.log("Audio line    :", audioLine);

  if (!ffprobeOutput.includes("Audio:")) {
    throw new Error("No Audio stream detected — check the file or the S3 key");
  }

  console.log("\n✓ Success!");
  console.log(`  videoId : ${videoId}`);
  console.log(`  S3 key  : ${s3Key}`);
  console.log(`  source  : { type: "local" }`);
  console.log(`  Open    : http://localhost:3001/s/${videoId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
