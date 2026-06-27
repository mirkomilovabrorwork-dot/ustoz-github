import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Privacy Policy | data365",
	description: "Privacy information for data365.",
};

const sections = [
	{
		title: "Information we process",
		body: "data365 may process account details, workspace membership, uploaded videos, thumbnails, comments, transcripts, AI summaries, analytics events, and technical logs needed to run the service.",
	},
	{
		title: "How information is used",
		body: "We use information to provide recording, upload, sharing, playback, transcription, AI, security, troubleshooting, and workspace administration features.",
	},
	{
		title: "AI and transcription",
		body: "When AI features are enabled, video audio, transcripts, and related prompts may be sent to configured AI providers to generate transcripts, summaries, chapters, titles, embeddings, or chat answers.",
	},
	{
		title: "Sharing controls",
		body: "Workspace owners and admins can manage public links, spaces, folders, member roles, comments, reactions, downloads, and other viewer permissions.",
	},
	{
		title: "Retention and deletion",
		body: "Content remains available until it is deleted by an authorized user or removed according to workspace policy. Some operational logs and backups may remain for a limited period.",
	},
];

export default function PrivacyPage() {
	return (
		<main className="min-h-screen bg-gray-1 px-5 py-10 text-gray-12 sm:px-8">
			<div className="mx-auto flex max-w-3xl flex-col gap-8">
				<header className="space-y-3">
					<Link
						href="/login"
						className="text-sm font-medium text-blue-11 hover:text-blue-10"
					>
						data365
					</Link>
					<div className="space-y-2">
						<h1 className="text-3xl font-semibold tracking-normal">
							Privacy Policy
						</h1>
						<p className="text-sm text-gray-10">
							Last updated June 27, 2026
						</p>
					</div>
				</header>

				<div className="space-y-6 text-sm leading-6 text-gray-11">
					<p>
						This page explains the practical privacy behavior of data365 for
						users and workspace administrators.
					</p>
					{sections.map((section) => (
						<section key={section.title} className="space-y-2">
							<h2 className="text-lg font-semibold text-gray-12">
								{section.title}
							</h2>
							<p>{section.body}</p>
						</section>
					))}
					<section className="space-y-2">
						<h2 className="text-lg font-semibold text-gray-12">Contact</h2>
						<p>
							For access, correction, deletion, or privacy questions, contact
							the data365 workspace owner or support contact that provided your
							account.
						</p>
					</section>
				</div>
			</div>
		</main>
	);
}
