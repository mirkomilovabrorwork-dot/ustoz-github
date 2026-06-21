import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@cap/database";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;
const S3_TIMEOUT_MS = 3000;

async function checkDb(): Promise<"ok" | "error"> {
  try {
    const result = await Promise.race([
      db().execute(sql`SELECT 1`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), DB_TIMEOUT_MS),
      ),
    ]);
    return result ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkStorage(): Promise<"ok" | "unknown" | "error"> {
  const bucket = process.env.CAP_AWS_BUCKET;
  const region = process.env.CAP_AWS_REGION ?? "us-east-1";
  const accessKeyId = process.env.CAP_AWS_ACCESS_KEY;
  const secretAccessKey = process.env.CAP_AWS_SECRET_KEY;
  // Prefer the internal endpoint (cheaper), fall back to public or raw CAP_AWS_ENDPOINT
  const endpoint =
    process.env.S3_INTERNAL_ENDPOINT ??
    process.env.S3_PUBLIC_ENDPOINT ??
    process.env.CAP_AWS_ENDPOINT;
  const forcePathStyle = (process.env.S3_PATH_STYLE ?? "true") === "true";

  // If the minimum required config is absent, report unknown rather than error
  if (!bucket || !accessKeyId || !secretAccessKey) {
    return "unknown";
  }

  try {
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
      requestHandler: { requestTimeout: S3_TIMEOUT_MS } as Record<string, unknown>,
    });

    await Promise.race([
      client.send(new HeadBucketCommand({ Bucket: bucket })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("S3 timeout")), S3_TIMEOUT_MS),
      ),
    ]);

    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const [dbStatus, storageStatus] = await Promise.all([checkDb(), checkStorage()]);

  const checks = { db: dbStatus, storage: storageStatus };

  // DB is a required check; storage is best-effort (unknown is not a failure)
  const degraded = dbStatus === "error" || storageStatus === "error";

  return NextResponse.json(
    { status: degraded ? "degraded" : "ok", checks, time: Date.now() },
    { status: degraded ? 503 : 200 },
  );
}
