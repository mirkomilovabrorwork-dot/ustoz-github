import { ClaimInvite } from "./ClaimInvite";

export default async function InviteLandingPage(props: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await props.params;
	return (
		<div className="flex h-screen items-center justify-center">
			<ClaimInvite token={token} />
		</div>
	);
}
