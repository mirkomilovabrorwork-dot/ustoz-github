import fs from "node:fs";
import path from "node:path";

export type DocMetadata = {
	title: string;
	summary: string;
	description?: string;
	tags?: string;
	image?: string;
};

export interface DocEntry {
	metadata: DocMetadata;
	slug: string;
	content: string;
}

function parseFrontmatter(fileContent: string) {
	const frontmatterRegex = /---\s*([\s\S]*?)\s*---/;
	const match = frontmatterRegex.exec(fileContent);
	if (!match || !match[1]) {
		throw new Error("Invalid or missing frontmatter");
	}

	const frontMatterBlock = match[1];
	const content = fileContent.replace(frontmatterRegex, "").trim();
	const frontMatterLines = frontMatterBlock.trim().split("\n");
	const metadata: Partial<DocMetadata> = {};

	frontMatterLines.forEach((line) => {
		const [key, ...valueArr] = line.split(": ");
		if (!key) return;

		let value = valueArr.join(": ").trim();
		value = value.replace(/^['"](.*)['"]$/, "$1"); // Remove quotes
		metadata[key.trim() as keyof DocMetadata] = value;
	});

	return {
		metadata: metadata as DocMetadata,
		content,
	};
}

function getMDXFiles(dir: string) {
	const files: string[] = [];
	if (!fs.existsSync(dir)) {
		return files;
	}

	function scanDir(currentDir: string) {
		const entries = fs.readdirSync(currentDir);
		entries.forEach((entry) => {
			const fullPath = path.join(currentDir, entry);
			const stat = fs.statSync(fullPath);

			if (stat.isDirectory()) {
				scanDir(fullPath);
			} else if (path.extname(entry) === ".mdx") {
				const relativePath = path.relative(dir, fullPath);
				files.push(relativePath);
			}
		});
	}

	scanDir(dir);
	return files;
}

function readMDXFile(filePath: string) {
	const rawContent = fs.readFileSync(filePath, "utf-8");
	return parseFrontmatter(rawContent);
}

function getMDXData(dir: string): DocEntry[] {
	const mdxFiles = getMDXFiles(dir);
	return mdxFiles.map((relativePath) => {
		const fullPath = path.join(dir, relativePath);
		const { metadata, content } = readMDXFile(fullPath);
		const slug = relativePath
			.replace(/\.mdx$/, "") // Remove .mdx extension
			.split(path.sep) // Split on directory separator
			.join("/"); // Join with forward slashes for URL

		return {
			metadata,
			slug,
			content,
		};
	});
}

export function getDocs() {
	return getMDXData(path.join(process.cwd(), "content/docs"));
}
