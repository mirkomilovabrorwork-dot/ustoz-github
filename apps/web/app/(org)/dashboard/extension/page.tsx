import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Browser Extension — data365",
};

export default function ExtensionPage() {
	return (
		<div className="flex flex-col w-full h-full">
			<div className="flex flex-wrap gap-3 items-center mb-10 w-full">
				<div>
					<h1 className="text-2xl font-medium text-gray-12">
						365 Browser Extension
					</h1>
					<p className="mt-1 text-gray-10 text-md">
						Record Google Meet calls and instructional videos right from Chrome.
					</p>
				</div>
			</div>

			<div className="max-w-lg">
				<a
					href="/365-extension.zip"
					download
					className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="size-4"
						aria-hidden="true"
					>
						<path d="M12 3v13M5 14l7 7 7-7" />
						<path d="M3 21h18" />
					</svg>
					Download extension
				</a>

				<ol className="mt-8 flex flex-col gap-4">
					{[
						<>
							Download the file, then{" "}
							<span className="font-semibold text-gray-12">unzip it first</span>{" "}
							— Chrome loads an unzipped folder, not the .zip.
						</>,
						<>
							Open{" "}
							<code className="rounded border border-gray-5 bg-gray-3 px-1.5 py-0.5 text-xs font-mono text-gray-12">
								chrome://extensions
							</code>{" "}
							in Chrome.
						</>,
						<>
							Turn on{" "}
							<span className="font-semibold text-gray-12">Developer mode</span>{" "}
							(top-right toggle).
						</>,
						<>
							Click{" "}
							<span className="font-semibold text-gray-12">Load unpacked</span>.
						</>,
						"Select the unzipped folder.",
						<>
							Open the extension&apos;s{" "}
							<span className="font-semibold text-gray-12">Options</span> and
							sign in — you&apos;re ready to record.
						</>,
					].map((step, i) => (
						<li key={i} className="flex gap-4 items-start">
							<span className="flex-shrink-0 flex items-center justify-center size-7 rounded-full bg-blue-600 text-white text-sm font-bold">
								{i + 1}
							</span>
							<p className="text-sm text-gray-11 pt-1">{step}</p>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}
