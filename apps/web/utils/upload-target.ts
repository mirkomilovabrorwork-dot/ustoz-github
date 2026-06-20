import type { Storage } from "@cap/web-domain";

type UploadTarget =
	| Storage.UploadTarget
	| {
			url: string;
			fields: Record<string, string>;
	  };

type UploadProgress = {
	loaded: number;
	total: number;
};

const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 500;

class UploadRequestError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`Upload failed with status ${status}`);
		this.name = "UploadRequestError";
		this.status = status;
	}
}

const shouldRetryUpload = (error: unknown) =>
	!(error instanceof UploadRequestError) ||
	error.status === 0 ||
	error.status >= 500;

const isPostTarget = (
	target: UploadTarget,
): target is { url: string; fields: Record<string, string> } =>
	!("type" in target) || target.type === "s3Post";

const isDriveResumableTarget = (
	target: UploadTarget,
): target is Extract<Storage.UploadTarget, { type: "driveResumable" }> =>
	"type" in target && target.type === "driveResumable";

export function uploadWithTarget({
	target,
	body,
	fileName,
	onProgress,
}: {
	target: UploadTarget;
	body: Blob;
	fileName?: string;
	onProgress?: (progress: UploadProgress) => void;
}) {
	const waitForRetry = (attempt: number) =>
		new Promise<void>((resolve) => {
			window.setTimeout(resolve, attempt * RETRY_BACKOFF_MS);
		});

	const uploadOnce = () =>
		new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			if (isPostTarget(target)) {
				const formData = new FormData();
				Object.entries(target.fields).forEach(([key, value]) => {
					formData.append(key, value);
				});
				formData.append("file", body, fileName);
				xhr.open("POST", target.url);
				xhr.upload.onprogress = (event) => {
					if (event.lengthComputable) {
						onProgress?.({ loaded: event.loaded, total: event.total });
					}
				};
				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						resolve();
					} else {
						reject(new UploadRequestError(xhr.status));
					}
				};
				xhr.onerror = () => reject(new Error("Upload failed"));
				xhr.send(formData);
				return;
			}

			xhr.open("PUT", target.url);
			Object.entries(target.headers).forEach(([key, value]) => {
				xhr.setRequestHeader(key, value);
			});
			if (isDriveResumableTarget(target) && body.size > 0) {
				xhr.setRequestHeader(
					"Content-Range",
					`bytes 0-${body.size - 1}/${body.size}`,
				);
			}
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					onProgress?.({ loaded: event.loaded, total: event.total });
				}
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve();
				} else {
					reject(new UploadRequestError(xhr.status));
				}
			};
			xhr.onerror = () => reject(new Error("Upload failed"));
			xhr.send(body);
		});

	return (async () => {
		let lastError: unknown;

		for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
			try {
				await uploadOnce();
				return;
			} catch (error) {
				lastError = error;
				if (!shouldRetryUpload(error) || attempt >= MAX_UPLOAD_ATTEMPTS) {
					break;
				}
				await waitForRetry(attempt);
			}
		}

		throw lastError instanceof Error ? lastError : new Error("Upload failed");
	})();
}
