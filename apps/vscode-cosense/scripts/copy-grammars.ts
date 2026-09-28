/**
 * Puts the TextMate grammars where package.json's `contributes.grammars` points. They are
 * built by @cosense-toolbox/textmate, so the copies are output, not source.
 */
import { copyFile, mkdir } from "node:fs/promises"
import { createRequire } from "node:module"

import { Effect, pipe } from "effect"

const require = createRequire(import.meta.url)
const dir = new URL("../syntaxes/", import.meta.url)

const copy = (name: string): Effect.Effect<void, unknown> =>
  Effect.tryPromise(() =>
    copyFile(
      require.resolve(`@cosense-toolbox/textmate/${name}.tmLanguage.json`),
      new URL(`${name}.tmLanguage.json`, dir),
    ),
  )

// A failure rejects, so the build stops rather than going on without the grammars.
await pipe(
  Effect.tryPromise(() => mkdir(dir, { recursive: true })),
  Effect.flatMap(() => Effect.forEach(["cosense", "cosense-x"], copy, { discard: true })),
  Effect.runPromise,
)
