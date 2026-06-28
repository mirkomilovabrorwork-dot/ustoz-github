/**
 * _qa-import.ts — TEMP QA helper. Imports a local MP4 into the (Railway) DB + (R2) bucket
 * at the key the transcription pipeline expects: <userId>/<videoId>/result.mp4
 * Env required: DATABASE_URL, CAP_AWS_BUCKET, CAP_AWS_ENDPOINT, CAP_AWS_REGION,
 *               CAP_AWS_ACCESS_KEY, CAP_AWS_SECRET_KEY
 * Run from apps/web:  tsx scripts/_qa-import.ts
 */
import { createReadStream, statSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
  organizationMembers,
  organizations,
  users,
  videos,
} from "@cap/database/schema";
import { eq, or } from "drizzle-orm";

const FFMPEG =
  "C:/Users/localhost/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe";
const TARGET_FILE = "C:/Users/localhost/Desktop/ustoz-github/tmp-qa/test-demo.mp4";
const TARGET_EMAIL = "admin@ustoz.uz";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function probeDuration(filePath: string): number {
  let output = "";
  try {
    execSync(`"${FFMPEG}" -i "${filePath}" -hide_banner`, {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (err: any) {
    output = err.stderr?.toString() ?? "";
  }
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`No duration:\n${output}`);
  return (
    parseInt(match[1]!, 10) * 3600 +
    parseInt(match[2]!, 10) * 60 +
    parseFloat(match[3]!)
  );
}

async function main() {
  const duration = probeDuration(TARGET_FILE);
  console.log(`Duration: ${duration.toFixed(2)}s`);

  const [user] = await db()
    .select()
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);
  if (!user) throw new Error(`No user: ${TARGET_EMAIL}`);
  console.log(`User: ${user.id}`);

  const userOrgs = await db()
    .select({ id: organizations.id })
    .from(organizations)
    .leftJoin(
      organizationMembers,
      eq(organizations.id, organizationMembers.organizationId),
    )
    .where(
      or(
        eq(organizations.ownerId, user.id as any),
        eq(organizationMembers.userId, user.id as any),
      ),
    )
    .groupBy(organizations.id)
    .orderBy(organizations.createdAt);
  const orgId = userOrgs[0]?.id;
  if (!orgId) throw new Error("no org");
  console.log(`OrgId: ${orgId}`);

  const videoId = nanoId();
  const s3Key = `${user.id}/${videoId}/result.mp4`;
  console.log(`VideoId: ${videoId}  Key: ${s3Key}`);

  const s3 = new S3Client({
    endpoint: requireEnv("CAP_AWS_ENDPOINT"),
    region: requireEnv("CAP_AWS_REGION"),
    credentials: {
      accessKeyId: requireEnv("CAP_AWS_ACCESS_KEY"),
      secretAccessKey: requireEnv("CAP_AWS_SECRET_KEY"),
    },
    forcePathStyle: true,
  });
  const bucket = requireEnv("CAP_AWS_BUCKET");

  const fileStats = statSync(TARGET_FILE);
  console.log(`Uploading ${(fileStats.size / 1024 / 1024).toFixed(1)} MB …`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: createReadStream(TARGET_FILE),
      ContentType: "video/mp4",
      ContentLength: fileStats.size,
    }),
  );
  console.log(`Uploaded s3://${bucket}/${s3Key}`);

  await db()
    .insert(videos as any)
    .values({
      id: videoId,
      name: "QA Test — data365 demo",
      ownerId: user.id,
      orgId,
      duration,
      source: { type: "local" },
      public: true,
    });
  console.log(`Video row inserted: ${videoId}`);

  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    { expiresIn: 3600 },
  );
  let probe = "";
  try {
    execSync(`"${FFMPEG}" -i "${presignedUrl}" -hide_banner`, {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 30000,
    });
  } catch (err: any) {
    probe = err.stderr?.toString() ?? "";
  }
  console.log("Audio line:", probe.match(/Audio:[^\n]+/)?.[0] ?? "(none)");
  console.log(`\n✓ videoId=${videoId}`);
  console.log(`Open: https://capweb-production-dd85.up.railway.app/s/${videoId}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
