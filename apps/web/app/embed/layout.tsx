import type { PropsWithChildren } from "react";
import { PublicPageProviders } from "../Layout/PublicPageProviders";

export const dynamic = "force-dynamic";

export default function EmbedLayout({ children }: PropsWithChildren) {
	return <PublicPageProviders>{children}</PublicPageProviders>;
}
