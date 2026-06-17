import type { Metadata } from "next";
import { ImportPage } from "./ImportPage";

export const metadata: Metadata = {
	title: "Import — data365",
};

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ folderId?: string }>;
}) {
	const { folderId } = await searchParams;
	return <ImportPage folderId={folderId} />;
}
