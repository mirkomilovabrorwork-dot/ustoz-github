import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ffmpeg-static", () => ({
	default: "/usr/local/bin/ffmpeg",
}));

const mockReadFile = vi.fn(async (_path: string) => Buffer.from("video-data"));
const mockMkdtemp = vi.fn(async (_prefix: string) => "/tmp/cap-video-test");
const mockWriteFile = vi.fn(
	async (_path: string, _content: string) => undefined,
);
const mockRm = vi.fn(async (_path: string) => undefined);

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: (path: string) => path === "/usr/local/bin/ffmpeg",
		promises: {
			...actual.promises,
			mkdtemp: (prefix: string) => mockMkdtemp(prefix),
			readFile: (path: string) => mockReadFile(path),
			rm: (path: string) => mockRm(path),
			writeFile: (path: string, content: string) =>
				mockWriteFile(path, content),
		},
	};
});

class MockChildProcess extends EventEmitter {
	stderr = new EventEmitter();
}

let spawnedProcesses: MockChildProcess[] = [];
let spawnArgs: { command: string; args: string[] }[] = [];

vi.mock("node:child_process", () => ({
	spawn: (command: string, args: string[]) => {
		const proc = new MockChildProcess();
		spawnedProcesses.push(proc);
		spawnArgs.push({ command, args });
		return proc;
	},
}));

describe("video-convert", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		spawnedProcesses = [];
		spawnArgs = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();

				if (url.includes("video.m3u8")) {
					return {
						ok: true,
						text: async () =>
							'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,AUDIO="audio"\nmedia-video.m3u8\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio",DEFAULT="YES",URI="media-audio.m3u8"',
					} as Response;
				}

				if (url.includes("media-video.m3u8")) {
					return {
						ok: true,
						text: async () => "#EXTM3U\n#EXTINF:1,\nsegment-video.ts",
					} as Response;
				}

				if (url.includes("media-audio.m3u8")) {
					return {
						ok: true,
						text: async () => "#EXTM3U\n#EXTINF:1,\nsegment-audio.aac",
					} as Response;
				}

				throw new Error(`Unexpected fetch: ${url}`);
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("uses stream copy before transcoding", async () => {
		const { convertRemoteVideoToMp4Buffer } = await import(
			"@/lib/video-convert"
		);

		const resultPromise = convertRemoteVideoToMp4Buffer(
			"https://example.com/video.m3u8",
		);

		setTimeout(() => {
			spawnedProcesses[0]?.emit("close", 0);
		}, 10);

		const result = await resultPromise;

		expect(result.toString()).toBe("video-data");
		expect(spawnArgs).toHaveLength(1);
		expect(spawnArgs[0]?.args).toContain("-c");
		expect(spawnArgs[0]?.args).toContain("copy");
		expect(mockWriteFile).toHaveBeenCalled();
	});

	it("falls back to transcoding when stream copy fails", async () => {
		const { convertRemoteVideoToMp4Buffer } = await import(
			"@/lib/video-convert"
		);

		const resultPromise = convertRemoteVideoToMp4Buffer(
			"https://example.com/video.m3u8",
		);

		setTimeout(() => {
			spawnedProcesses[0]?.stderr.emit("data", Buffer.from("copy failed"));
			spawnedProcesses[0]?.emit("close", 1);
			setTimeout(() => {
				spawnedProcesses[1]?.emit("close", 0);
			}, 10);
		}, 10);

		await resultPromise;

		expect(spawnArgs).toHaveLength(2);
		expect(spawnArgs[1]?.args).toContain("libx264");
		expect(spawnArgs[1]?.args).toContain("-crf");
		expect(spawnArgs[1]?.args).toContain("26");
		expect(spawnArgs[1]?.args).toContain("aac");
	});

	it("parses ffmpeg probe output and keeps already-small videos as copy", async () => {
		const { chooseVideoOptimizationStrategy, parseVideoProbeMetadata } =
			await import("@/lib/video-convert");

		const metadata = parseVideoProbeMetadata(`
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'video.mp4':
  Duration: 00:42:03.45, start: 0.000000, bitrate: 1420 kb/s
  Stream #0:0: Video: h264 (High), yuv420p, 1280x720, 30 fps
  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo
`);

		expect(metadata).toMatchObject({
			durationSec: 2523.45,
			width: 1280,
			height: 720,
			videoCodec: "h264",
			audioCodec: "aac",
			bitrateBps: 1420000,
		});
		expect(chooseVideoOptimizationStrategy(metadata)).toBe("copy");
	});

	it("compresses videos with very high bitrate or resolution", async () => {
		const { chooseVideoOptimizationStrategy } = await import(
			"@/lib/video-convert"
		);

		expect(
			chooseVideoOptimizationStrategy({
				durationSec: 300,
				width: 1920,
				height: 1080,
				videoCodec: "h264",
				audioCodec: "aac",
				bitrateBps: 1800000,
			}),
		).toBe("compress");

		expect(
			chooseVideoOptimizationStrategy({
				durationSec: 300,
				width: 1280,
				height: 720,
				videoCodec: "h264",
				audioCodec: "aac",
				bitrateBps: 4500000,
			}),
		).toBe("compress");
	});

	it("does not copy codecs that are risky in browser MP4 playback", async () => {
		const { chooseVideoOptimizationStrategy } = await import(
			"@/lib/video-convert"
		);

		expect(
			chooseVideoOptimizationStrategy({
				durationSec: 300,
				width: 1280,
				height: 720,
				videoCodec: "vp9",
				audioCodec: "opus",
				bitrateBps: 1200000,
			}),
		).toBe("compress");

		expect(
			chooseVideoOptimizationStrategy({
				durationSec: 300,
				width: 1280,
				height: 720,
				videoCodec: "hevc",
				audioCodec: "aac",
				bitrateBps: 1200000,
			}),
		).toBe("compress");

		expect(
			chooseVideoOptimizationStrategy({
				durationSec: 300,
				width: 1280,
				height: 720,
				videoCodec: "h264",
				audioCodec: null,
				bitrateBps: 1200000,
			}),
		).toBe("copy");
	});

	it("returns strategy in optimizeRemoteVideoToMp4 result", async () => {
		const { optimizeRemoteVideoToMp4 } = await import("@/lib/video-convert");

		const resultPromise = optimizeRemoteVideoToMp4(
			"https://example.com/video.m3u8",
		);

		// The probe call returns stderr with a small efficient video → strategy = "copy"
		// First spawn: probe (ffmpeg -hide_banner -i ...) → close 0
		setTimeout(() => {
			// Simulate ffmpeg probe stderr with efficient h264/aac/low-bitrate
			spawnedProcesses[0]?.stderr.emit(
				"data",
				Buffer.from(
					'Input #0, mp4:\n  Duration: 00:01:00.00, start: 0, bitrate: 1000 kb/s\n  Stream #0:0: Video: h264, yuv420p, 640x480\n  Stream #0:1: Audio: aac',
				),
			);
			spawnedProcesses[0]?.emit("close", 0);
			// Second spawn: copy (ffmpeg -y -i ... -c copy ...) → close 0
			setTimeout(() => {
				spawnedProcesses[1]?.emit("close", 0);
			}, 10);
		}, 10);

		const result = await resultPromise;

		expect(result.strategy).toBe("copy");
		expect(result.metadata).toBeDefined();
	});
});
