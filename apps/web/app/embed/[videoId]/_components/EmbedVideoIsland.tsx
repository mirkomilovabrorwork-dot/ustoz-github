"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { EmbedVideo as EmbedVideoComponent } from "./EmbedVideo";

// Load the player as a client-only island (ssr: false). The embed page renders
// inside the App Router whose useActionQueue runs use(thenable) during
// hydration; a server-rendered player that also suspends during hydration adds
// a second suspend, tripping a React 19 hook-count bug (#310) on the owner
// path. Mounting the player AFTER hydration removes it from the hydration tree
// so it can no longer contribute that suspend. See facebook/react#33556/#33580.
const EmbedVideoDynamic = dynamic(
	() => import("./EmbedVideo").then((m) => m.EmbedVideo),
	{
		ssr: false,
		loading: () => <div className="min-h-screen bg-black" />,
	},
);

export function EmbedVideoIsland(
	props: ComponentProps<typeof EmbedVideoComponent>,
) {
	return <EmbedVideoDynamic {...props} />;
}
