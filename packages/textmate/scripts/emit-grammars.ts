/**
 * Writes the grammars as `.tmLanguage.json`, for editors that load the file itself.
 * They are built from src/grammar.ts, so the files are output, not source.
 */
import { mkdir, writeFile } from "node:fs/promises"

import { Effect, pipe } from "effect"

import { cosense, cosenseX, type Grammar } from "../src/index"

const dir = new URL("../grammars/", import.meta.url)

const write = (grammar: Grammar): Effect.Effect<void, unknown> =>
  Effect.tryPromise(() =>
    writeFile(
      new URL(`${grammar.name}.tmLanguage.json`, dir),
      `${JSON.stringify(grammar, null, 2)}\n`,
    ),
  )

// A failure rejects, so the build stops rather than publishing without the files.
await pipe(
  Effect.tryPromise(() => mkdir(dir, { recursive: true })),
  Effect.flatMap(() => Effect.forEach([cosense, cosenseX], write, { discard: true })),
  Effect.runPromise,
)
