import { getStorageUsage } from "@/actions/organization/get-storage-usage";
import { StorageDetailsClient } from "./StorageDetailsClient";

export default async function StoragePage() {
	const data = await getStorageUsage();
	return <StorageDetailsClient data={data} />;
}
