import type { Metadata } from "next";
import { RecordVideoPage } from "./RecordVideoPage";

export const metadata: Metadata = {
	title: "Record a Cap",
};

export default async function RecordVideoRoute({
	searchParams,
}: {
	searchParams: Promise<{ folderId?: string }>;
}) {
	const { folderId } = await searchParams;
	return <RecordVideoPage folderId={folderId} />;
}
