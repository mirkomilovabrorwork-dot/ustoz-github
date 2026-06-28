import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIndexedRows = vi.hoisted(() => [] as Array<{ id: string }>);
const mockLimit = vi.hoisted(() => vi.fn(async () => mockIndexedRows));
const mockDeleteWhere = vi.hoisted(() => vi.fn(async () => undefined));
const mockInsertValues = vi.hoisted(() => vi.fn(async () => undefined));
const mockGetObject = vi.hoisted(() => vi.fn());
const mockEmbedChunksWithUsage = vi.hoisted(() => vi.fn());
const mockWithCostGuard = vi.hoisted(() => vi.fn());

vi.mock("@cap/database", () => ({
	db: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: mockLimit,
				}),
			}),
		}),
		delete: () => ({
			where: mockDeleteWhere,
		}),
		insert: () => ({
			values: mockInsertValues,
		}),
	}),
}));

vi.mock("@cap/database/helpers", () => ({
	nanoId: () => "chunk-id",
}));

vi.mock("@cap/database/schema", () => ({
	transcriptChunks: {
		id: "id",
		videoId: "videoId",
		embedding: "embedding",
	},
	videos: {},
}));

vi.mock("@cap/web-domain", () => ({
	Video: {
		VideoId: {
			make: (id: string) => id,
		},
	},
}));

vi.mock("drizzle-orm", () => ({
	and: (...args: unknown[]) => args,
	eq: (field: unknown, value: unknown) => ({ field, value }),
	isNotNull: (field: unknown) => ({ isNotNull: field }),
}));

vi.mock("effect", () => ({
	Option: {
		isNone: (value: { _tag: string }) => value._tag === "None",
	},
}));

vi.mock("@/lib/server", () => ({
	runPromise: vi.fn(),
}));

vi.mock("@/lib/video-storage", () => ({
	getStorageAccessForVideo: () => ({
		pipe: () =>
			Promise.resolve([
				{
					getObject: mockGetObject,
				},
			]),
	}),
}));

vi.mock("@/lib/gemini-embed", () => ({
	EMBED_MODEL: "gemini-embedding-001",
	embedChunksWithUsage: mockEmbedChunksWithUsage,
}));

vi.mock("@/lib/ai-cost-guard", () => ({
	withCostGuard: mockWithCostGuard,
}));

const video = {
	id: "video-1",
	ownerId: "owner-1",
	orgId: "org-1",
} as never;

describe("transcript index", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIndexedRows.length = 0;
		mockGetObject.mockReturnValue({
			pipe: () =>
				Promise.resolve({
					_tag: "Some",
					value: `WEBVTT

1
00:00:00.000 --> 00:00:04.000
Speaker 1: We discussed the dashboard deadline.
`,
				}),
		});
		mockEmbedChunksWithUsage.mockResolvedValue({
			embeddings: [[0.1, 0.2, 0.3]],
			totalTokens: 12,
		});
		mockWithCostGuard.mockImplementation(
			async (options: { fn: () => Promise<unknown> }) => await options.fn(),
		);
	});

	it("does not call embeddings when the transcript index already exists", async () => {
		mockIndexedRows.push({ id: "existing-chunk" });
		const { ensureTranscriptIndex } = await import("@/lib/transcript-index");

		const result = await ensureTranscriptIndex({
			videoId: "video-1",
			video,
			apiKey: "gemini-key",
			userId: "owner-1",
		});

		expect(result).toBe(true);
		expect(mockGetObject).not.toHaveBeenCalled();
		expect(mockEmbedChunksWithUsage).not.toHaveBeenCalled();
		expect(mockInsertValues).not.toHaveBeenCalled();
	});

	it("builds embeddings lazily from the transcript when chat needs them", async () => {
		const { ensureTranscriptIndex } = await import("@/lib/transcript-index");

		const result = await ensureTranscriptIndex({
			videoId: "video-1",
			video,
			apiKey: "gemini-key",
			userId: "owner-1",
		});

		expect(result).toBe(true);
		expect(mockEmbedChunksWithUsage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					text: "We discussed the dashboard deadline.",
				}),
			],
			"gemini-key",
		);
		expect(mockDeleteWhere).toHaveBeenCalled();
		expect(mockInsertValues).toHaveBeenCalledWith([
			expect.objectContaining({
				videoId: "video-1",
				chunkIndex: 0,
				embedding: [0.1, 0.2, 0.3],
				embeddingModel: "gemini-embedding-001",
			}),
		]);
	});
});
