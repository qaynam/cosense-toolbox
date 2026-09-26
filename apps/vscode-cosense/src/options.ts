/**
 * What the extension hands the language server, decided without VS Code so it can be tested.
 */
import { join, resolve } from "node:path"

import { Array as Arr, Option, pipe, Predicate, Record as Rec } from "effect"

/** The `cosense.*` settings the server takes, under the names it takes them by. */
const SERVER_SETTINGS = ["sources", "decorations", "unresolvedLinks", "frontmatter"] as const

/**
 * The server's initialization options: each setting the user made, as it is. The server
 * checks their shapes and falls back to its own defaults, so nothing is second-guessed here.
 */
export const initializationOptionsOf = (
  read: (key: string) => unknown,
): Readonly<Record<string, unknown>> =>
  Rec.fromEntries(
    Arr.filterMap(SERVER_SETTINGS, (key) =>
      pipe(
        Option.fromNullable(read(key)),
        Option.map((value) => [key, value] as const),
      ),
    ),
  )

/** The server to run: the one at `cosense.server.path`, or the one bundled with the extension. */
export const serverModuleOf = (setting: unknown, extensionDir: string): string =>
  pipe(
    Option.liftPredicate(
      setting,
      (path): path is string => Predicate.isString(path) && path !== "",
    ),
    Option.match({
      onNone: () => join(extensionDir, "dist/server.mjs"),
      onSome: (path) => resolve(path),
    }),
  )
