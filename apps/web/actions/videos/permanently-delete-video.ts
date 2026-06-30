"use server";

import { getCurrentUser, makeCurrentUserLayer, Videos } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { Effect, Option } from "effect";
import { revalidatePath } from "next/cache";
import { runPromise } from "@/lib/server";

export async function permanentlyDeleteVideo(videoId: Video.VideoId) {
  if (!videoId) {
    throw new Error("Missing required data");
  }

  await Effect.gen(function* () {
    const maybeUser = yield* getCurrentUser;
    if (Option.isNone(maybeUser)) {
      return yield* Effect.fail(new Error("Unauthorized"));
    }
    const videos = yield* Videos;
    yield* videos
      .permanentlyDelete(videoId)
      .pipe(Effect.provide(makeCurrentUserLayer(maybeUser.value)));
  }).pipe(runPromise);

  revalidatePath("/dashboard/trash");
  revalidatePath("/dashboard/caps");
  return { success: true };
}
