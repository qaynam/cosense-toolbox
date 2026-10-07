/**
 * `@cosense-toolbox/lsp/media`. The modules inside answer in effect's types; what is handed
 * out here is plain, so a user need not know effect.
 */
import { Effect } from "effect"

import { mediaFilesIn as mediaFilesEffect } from "../media"

export * from "../media"

/**
 * The images, videos and sounds under `root`, as site paths. A directory that cannot be read
 * holds none: the promise never rejects.
 */
export const mediaFilesIn = (root: string): Promise<ReadonlyArray<string>> =>
  Effect.runPromise(mediaFilesEffect(root))
