const SAFE_KEY_SEGMENT = /^[A-Za-z0-9._-]+$/;
const RESERVED_KEY_SEGMENTS = new Set([
	".",
	"con",
	"prn",
	"aux",
	"nul",
	"com1",
	"com2",
	"com3",
	"com4",
	"com5",
	"com6",
	"com7",
	"com8",
	"com9",
	"lpt1",
	"lpt2",
	"lpt3",
	"lpt4",
	"lpt5",
	"lpt6",
	"lpt7",
	"lpt8",
	"lpt9",
]);

function assertSafeKeyPath(value: string, label: string) {
	if (
		!value ||
		value.startsWith("/") ||
		value.includes("\\") ||
		value.includes("..")
	) {
		throw new Error(`Invalid ${label}`);
	}

	const segments = value.split("/");
	for (const segment of segments) {
		const reservedName = segment.toLowerCase().split(".")[0] ?? "";
		if (
			!segment ||
			!SAFE_KEY_SEGMENT.test(segment) ||
			RESERVED_KEY_SEGMENTS.has(segment.toLowerCase()) ||
			RESERVED_KEY_SEGMENTS.has(reservedName)
		) {
			throw new Error(`Invalid ${label}`);
		}
	}
}

export function parseVideoIdOrFileKey(
	userId: string,
	input:
		| { videoId: string; subpath: string }
		| {
				// deprecated
				fileKey: string;
		  },
) {
	let videoId: string;
	let subpath: string;

	if ("fileKey" in input) {
		assertSafeKeyPath(input.fileKey, "fileKey");
		const [_, _videoId, ...subpathParts] = input.fileKey.split("/");
		if (!_videoId || subpathParts.length === 0) throw new Error("Invalid fileKey");
		videoId = _videoId;
		subpath = subpathParts.join("/");
	} else {
		videoId = input.videoId;
		subpath = input.subpath;
		assertSafeKeyPath(videoId, "videoId");
		assertSafeKeyPath(subpath, "subpath");
	}

	return `${userId}/${videoId}/${subpath}`;
}
