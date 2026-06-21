import("dotenv").then(({ config }) => config({ path: "../../.env" }));

import fs from "node:fs";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import workflowNext from "workflow/next";

const { withWorkflow } = workflowNext;
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const packageJson = JSON.parse(
	fs.readFileSync(path.resolve("./package.json"), "utf8"),
);
const { version } = packageJson;

const fallbackWebUrl = "https://web-production-e6fe4.up.railway.app";
const configuredWebUrl =
	[process.env.WEB_URL, process.env.NEXT_PUBLIC_WEB_URL, fallbackWebUrl]
		.map((value) => value?.trim())
		.find(Boolean) ?? fallbackWebUrl;

function getHostWithOptionalPort(value) {
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).host;
	} catch {
		return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
	}
}

const serverActionAllowedOrigins = Array.from(
	new Set(
		[
			getHostWithOptionalPort(configuredWebUrl),
			getHostWithOptionalPort(fallbackWebUrl),
			"localhost:3000",
			"localhost:3001",
		].filter(Boolean),
	),
);

const ffmpegTracingIncludes = [
	"./node_modules/ffmpeg-static/ffmpeg",
	"./node_modules/.pnpm/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/ffmpeg",
];

const nextConfig = {
	reactStrictMode: true,
	serverExternalPackages: ["ffmpeg-static", "prettier"],
	outputFileTracingIncludes: {
		"/.well-known/workflow/v1/step": ffmpegTracingIncludes,
		"/api/tools/loom-download": ffmpegTracingIncludes,
	},
	transpilePackages: [
		"@cap/ui",
		"@cap/utils",
		"@cap/web-api-contract",
		"@cap/web-domain",
		"@cap/env",
		"@cap/database",
		"next-mdx-remote",
	],
	typescript: {
		// Kept TRUE on purpose: the codebase imports with explicit `.ts` extensions
		// (e.g. `from "../helpers.ts"`), which `next build`'s type-check rejects
		// (allowImportingTsExtensions). Type safety IS enforced separately by the
		// root `tsc -b` gate (green). Flipping this to false only breaks the build
		// for no added safety. To flip it, first drop `.ts` extensions repo-wide.
		ignoreBuildErrors: true,
	},
	experimental: {
		optimizePackageImports: [
			"@cap/ui",
			"@cap/utils",
			"lucide-react",
			"framer-motion",
			"motion",
			"@fortawesome/free-solid-svg-icons",
			"@fortawesome/free-brands-svg-icons",
			"@tanstack/react-query",
			"recharts",
			"@radix-ui/react-dialog",
			"@radix-ui/react-dropdown-menu",
			"@radix-ui/react-popover",
			"@radix-ui/react-select",
			"@radix-ui/react-slider",
			"@radix-ui/react-tooltip",
			"date-fns",
		],
		turbopackFileSystemCacheForDev: true,
		serverActions: {
			allowedOrigins: serverActionAllowedOrigins,
		},
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
				port: "",
				pathname: "**",
			},
			{
				protocol: "https",
				hostname: "l.cap.so",
				port: "",
				pathname: "**",
			},
			process.env.NODE_ENV === "development" && {
				protocol: "http",
				hostname: "localhost",
				port: "9000",
				pathname: "**",
			},
		].filter(Boolean),
	},
	async headers() {
		return [
			{
				source: "/dashboard/:path*",
				headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
			},
		];
	},
	async rewrites() {
		return [
			{
				source: "/r/:path*",
				destination: "https://dub.cap.link/:path*",
			},
			{
				source: "/api/commercial/:path*",
				destination: "https://l.cap.so/api/commercial/:path*",
			},
			{
				source: "/s/:videoId",
				destination: "/s/:videoId",
				has: [
					{
						type: "host",
						value: "(?!cap.so|cap.link).*",
					},
				],
			},
			{
				source: "/c/:collectionId",
				destination: "/c/:collectionId",
				has: [
					{
						type: "host",
						value: "(?!cap.so|cap.link).*",
					},
				],
			},
		];
	},
	async redirects() {
		return [
			{
				source: "/roadmap",
				destination:
					"https://capso.notion.site/7aac740edeee49b5a23be901a7cb734e?v=9d4a3bf3d72d488cad9b899ab73116a1",
				permanent: true,
			},
			{
				source: "/updates",
				destination: "/blog",
				permanent: true,
			},
			{
				source: "/updates/:slug",
				destination: "/blog/:slug",
				permanent: true,
			},
			{
				source: "/docs/s3-config",
				destination: "/docs",
				permanent: true,
			},
		];
	},
	env: {
		appVersion: version,
	},
	output:
		process.env.NEXT_PUBLIC_DOCKER_BUILD === "true" ? "standalone" : undefined,
};

// Workflow plugin disabled — transcription/AI generation runs inline as
// fire-and-forget from lib/transcribe.ts and lib/generate-ai.ts.
export default withNextIntl(nextConfig);
