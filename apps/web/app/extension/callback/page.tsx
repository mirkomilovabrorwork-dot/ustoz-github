import { CallbackClient } from "./CallbackClient";

export const dynamic = "force-dynamic";

export default async function ExtensionCallbackPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const searchParams = await props.searchParams;

	const extensionId =
		typeof searchParams.extensionId === "string"
			? searchParams.extensionId
			: undefined;

	return (
		<div className="flex justify-center items-center min-h-screen bg-gray-2">
			<CallbackClient extensionId={extensionId} />
		</div>
	);
}
