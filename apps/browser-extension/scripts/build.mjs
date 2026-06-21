import * as esbuild from "esbuild";
import { copyFileSync, cpSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const srcDir = join(rootDir, "src");
const distDir = join(rootDir, "dist");
const publicDir = join(rootDir, "public");

const isWatch = process.argv.includes("--watch");

const commonOptions = {
	bundle: true,
	target: "chrome120",
	sourcemap: true,
	logLevel: "info",
};

const entryPoints = [
	{
		path: join(srcDir, "background/sw.ts"),
		outfile: join(distDir, "background.js"),
		format: "esm",
	},
	{
		path: join(srcDir, "content/meet-detect.ts"),
		outfile: join(distDir, "content.js"),
		format: "iife",
	},
	{
		path: join(srcDir, "offscreen/recorder.ts"),
		outfile: join(distDir, "offscreen.js"),
		format: "esm",
	},
	{
		path: join(srcDir, "recorder/recorder-page.ts"),
		outfile: join(distDir, "recorder-page.js"),
		format: "esm",
	},
	{
		path: join(srcDir, "popup/popup.ts"),
		outfile: join(distDir, "popup.js"),
		format: "esm",
	},
	{
		path: join(srcDir, "options/options.ts"),
		outfile: join(distDir, "options.js"),
		format: "esm",
	},
];

async function build() {
	const contexts = await Promise.all(
		entryPoints.map((entry) =>
			esbuild.context({
				...commonOptions,
				entryPoints: [entry.path],
				outfile: entry.outfile,
				format: entry.format,
			}),
		),
	);

	if (isWatch) {
		await Promise.all(contexts.map((ctx) => ctx.watch()));
		console.log("Watching for changes...");
	} else {
		await Promise.all(contexts.map((ctx) => ctx.rebuild()));
		await Promise.all(contexts.map((ctx) => ctx.dispose()));
	}

	copyAssets();
}

function copyAssets() {
	mkdirSync(distDir, { recursive: true });

	// Copy manifest
	copyFileSync(join(rootDir, "manifest.json"), join(distDir, "manifest.json"));

	// Copy public directory (icons, sounds)
	try {
		cpSync(publicDir, distDir, { recursive: true });
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}

	// Copy HTML and CSS files
	const pages = [
		{ dir: "popup", files: ["popup.html", "popup.css"] },
		{ dir: "offscreen", files: ["offscreen.html"] },
		{ dir: "recorder", files: ["recorder.html"] },
		{ dir: "options", files: ["options.html", "options.css"] },
	];
	for (const page of pages) {
		for (const file of page.files) {
			const srcFile = join(srcDir, page.dir, file);
			const distFile = join(distDir, file);
			try {
				copyFileSync(srcFile, distFile);
			} catch (err) {
				if (err.code !== "ENOENT") throw err;
			}
		}
	}

	console.log("Assets copied to dist/");
}

build().catch((err) => {
	console.error(err);
	process.exit(1);
});
