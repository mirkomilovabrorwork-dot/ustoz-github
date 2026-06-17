import type { Metadata } from "next";
import { ImportFilePage } from "./ImportFilePage";

export const metadata: Metadata = {
	title: "Upload File — data365",
};

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ folderId?: string }>;
}) {
	const { folderId } = await searchParams;
	return <ImportFilePage folderId={folderId} />;
}
