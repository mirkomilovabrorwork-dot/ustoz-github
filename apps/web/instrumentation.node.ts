// This file is used to run database migrations in the docker builds or other self hosting environments.
// It is not suitable (a.k.a DEADLY) for serverless environments where the server will be restarted on each request.
//

import {
	BucketAlreadyOwnedByYou,
	CreateBucketCommand,
	PutBucketCorsCommand,
	PutBucketPolicyCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { migrateDb } from "@cap/database/migrate";
import { buildEnv, serverEnv } from "@cap/env";

export async function register() {
	if (process.env.NEXT_PUBLIC_IS_CAP) return;

	console.log("Waiting 5 seconds to run migrations");
	const triggerMigrations = async (retryCount = 0, maxRetries = 3) => {
		try {
			await runMigrations();
		} catch (error) {
			const code =
				(error as { code?: string; cause?: { code?: string } })?.code ??
				(error as { cause?: { code?: string } })?.cause?.code;
			const benign = [
				"ER_DUP_FIELDNAME",
				"ER_TABLE_EXISTS_ERROR",
				"ER_DUP_KEYNAME",
			];
			if (code && benign.includes(code)) {
				console.warn(
					`⚠️  Migration error is benign (${code}). Schema is already at desired state. Continuing.`,
				);
				return;
			}
			console.error(
				`🚨 Error triggering migrations (attempt ${retryCount + 1}):`,
				error,
			);
			if (retryCount < maxRetries - 1) {
				console.log(
					`🔄 Retrying in 5 seconds... (${retryCount + 1}/${maxRetries})`,
				);
				setTimeout(() => triggerMigrations(retryCount + 1, maxRetries), 5000);
			} else {
				console.error(
					`🚨 All ${maxRetries} migration attempts failed. Continuing to serve traffic; investigate schema state.`,
				);
			}
		}
	};
	// Add a timeout to trigger migrations after 5 seconds on server start
	setTimeout(() => triggerMigrations(), 5000);
	setTimeout(() => createS3Bucket(), 5000);
}

async function applyS3BucketCors(s3Client: S3Client) {
	await s3Client.send(
		new PutBucketCorsCommand({
			Bucket: serverEnv().CAP_AWS_BUCKET,
			CORSConfiguration: {
				CORSRules: [
					{
						AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
						AllowedOrigins: ["*"],
						AllowedHeaders: ["*"],
						ExposeHeaders: ["ETag"],
						MaxAgeSeconds: 3600,
					},
				],
			},
		}),
	);
	console.log("Configured S3 bucket CORS");
}

async function createS3Bucket() {
	const s3Client = new S3Client({
		endpoint: serverEnv().S3_INTERNAL_ENDPOINT,
		region: serverEnv().CAP_AWS_REGION,
		credentials: {
			accessKeyId: serverEnv().CAP_AWS_ACCESS_KEY ?? "",
			secretAccessKey: serverEnv().CAP_AWS_SECRET_KEY ?? "",
		},
		forcePathStyle: serverEnv().S3_PATH_STYLE,
	});

	await s3Client
		.send(new CreateBucketCommand({ Bucket: serverEnv().CAP_AWS_BUCKET }))
		.then(() => {
			console.log("Created S3 bucket");
			return s3Client.send(
				new PutBucketPolicyCommand({
					Bucket: serverEnv().CAP_AWS_BUCKET,
					Policy: JSON.stringify({
						Version: "2012-10-17",
						Statement: [
							{
								Effect: "Allow",
								Principal: "*",
								Action: ["s3:GetObject"],
								Resource: [`arn:aws:s3:::${serverEnv().CAP_AWS_BUCKET}/*`],
							},
						],
					}),
				}),
			);
		})
		.then(() => {
			console.log("Configured S3 buckeet");
			return applyS3BucketCors(s3Client);
		})
		.catch(async (e) => {
			if (e instanceof BucketAlreadyOwnedByYou) {
				console.log("Found existing S3 bucket");
				await applyS3BucketCors(s3Client);
				return;
			}
		});
}

async function runMigrations() {
	const isDockerBuild = buildEnv.NEXT_PUBLIC_DOCKER_BUILD === "true";
	if (isDockerBuild) {
		try {
			console.log("🔍 DB migrations triggered");
			console.log("💿 Running DB migrations...");

			await migrateDb();

			console.log("💿 Migrations run successfully!");
		} catch (error) {
			console.error("🚨 MIGRATION_FAILED", { error });
			throw error;
		}
	}
}
