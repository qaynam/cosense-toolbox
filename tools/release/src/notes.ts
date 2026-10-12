#!/usr/bin/env bun
/**
 * GitHub のリリースノートの、自動で作る PR の一覧の上に置く部分を標準出力に書く。
 *
 *   bun tools/release/src/notes.ts 0.1.0-beta.9
 *
 * 公開するパッケージの README から `### <バージョン> の変更` の節を集め、公開する順に並べる (releaseNotesOf)。
 */
import { fileURLToPath } from "node:url"

import { Effect, pipe } from "effect"

import { isVersion, publishable, publishOrder, releaseNotesOf } from "./release"
import { readWorkspaces } from "./workspaces"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const version = Bun.argv[2] ?? ""

const program = isVersion(version)
  ? pipe(
      readWorkspaces(root),
      Effect.map((all) => releaseNotesOf(publishOrder(publishable(all)), version)),
      Effect.flatMap((notes) => Effect.sync(() => process.stdout.write(notes))),
    )
  : Effect.fail(new Error(`バージョンを渡す (例: 0.1.0-beta.9)。今は「${version}」`))

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
