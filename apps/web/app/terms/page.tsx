import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Terms of Service | data365",
	description: "Terms for using data365.",
};

const sections = [
	{
		title: "Using data365",
		body: "data365 helps you record, upload, share, transcribe, and summarize videos. You are responsible for the content you upload and for making sure you have permission to record or share it.",
	},
	{
		title: "Accounts and access",
		body: "Keep your login details secure. Organization owners and admins control workspace access, sharing settings, and member permissions.",
	},
	{
		title: "Content and AI features",
		body: "AI transcription, summaries, chapters, and chat can be imperfect. Review important outputs before relying on them, especially for business, legal, medical, or financial decisions.",
	},
	{
		title: "Availability",
		body: "We work to keep the service reliable, but recording, storage, transcription, and AI features may occasionally be delayed or unavailable because of browser, storage, provider, or infrastructure limits.",
	},
	{
		title: "Acceptable use",
		body: "Do not use data365 to upload illegal content, violate privacy rights, bypass access controls, abuse AI or storage resources, or interfere with the service.",
	},
];

export default function TermsPage() {
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
							Terms of Service
						</h1>
						<p className="text-sm text-gray-10">
							Last updated June 27, 2026
						</p>
					</div>
				</header>

				<div className="space-y-6 text-sm leading-6 text-gray-11">
					<p>
						These terms describe the basic rules for using data365. If your
						team has a separate written agreement with us, that agreement
						controls where it conflicts with this page.
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
							If you have questions about these terms, contact the data365
							workspace owner or support contact that provided your account.
						</p>
					</section>
				</div>
			</div>
		</main>
	);
}
