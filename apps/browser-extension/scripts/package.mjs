import { execFileSync } from "child_process";
import { copyFileSync, existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const outputFile = join(rootDir, "..", "365-extension.zip");
const publicOutputFile = join(rootDir, "..", "web", "public", "365-extension.zip");
const manifestFile = join(distDir, "manifest.json");

if (!existsSync(distDir)) {
	console.error("dist/ directory not found. Run 'pnpm build' first.");
	process.exit(1);
}

try {
	const manifestVersion = JSON.parse(readFileSync(manifestFile, "utf8")).version;

	execFileSync("zip", ["-r", outputFile, "."], {
		cwd: distDir,
		stdio: "inherit",
	});
	console.log(`Package created: ${outputFile}`);
	console.log(`Manifest version: ${manifestVersion}`);

	if (existsSync(dirname(publicOutputFile))) {
		copyFileSync(outputFile, publicOutputFile);
		console.log(`Copied package to: ${publicOutputFile}`);
	}
} catch (err) {
	console.error("Failed to create package:", err.message);
	process.exit(1);
}
