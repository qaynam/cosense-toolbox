#!/usr/bin/env bun
/**
 * 公開するすべてのパッケージのバージョンを、1 つのバージョンに揃えて書き換える。
 *
 *   bun run release:version 0.1.0-beta.3
 */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { $ } from "bun"
import { Array as Arr, Effect, pipe } from "effect"

import { isVersion, publishable, withLockVersion, withVersion } from "./release"
import { readWorkspaces } from "./workspaces"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const [version = ""] = Bun.argv.slice(2)

const program = pipe(
  Effect.filterOrFail(
    Effect.succeed(version),
    isVersion,
    () => new Error("使い方: bun run release:version <バージョン> (例: 0.1.0-beta.3)"),
  ),
  Effect.flatMap(() => readWorkspaces(root)),
  Effect.map(publishable),
  Effect.tap(
    Effect.forEach((workspace) =>
      Effect.tryPromise({
        try: async () => {
          const path = join(root, workspace.dir, "package.json")
          await writeFile(path, withVersion(await readFile(path, "utf8"), version))
        },
        catch: (cause) => new Error(`${workspace.dir} を書き換えられない: ${String(cause)}`),
      }),
    ),
  ),
  // bun pm pack は workspace:* を lockfile のバージョンに書き換えるので、lockfile のバージョンも揃える。
  // bun install はバージョンだけの変更では lockfile を更新しないので、自分で書き換える。
  Effect.tap((written) =>
    Effect.tryPromise({
      try: async () => {
        const path = join(root, "bun.lock")
        const lock = await readFile(path, "utf8")
        await writeFile(
          path,
          written.reduce((text, { dir }) => withLockVersion(text, dir, version), lock),
        )
      },
      catch: (cause) => new Error(`bun.lock を書き換えられない: ${String(cause)}`),
    }),
  ),
  // lockfile と package.json が食い違っていないことを確かめる。
  Effect.tap(() =>
    Effect.tryPromise({
      try: () => $`bun install --frozen-lockfile`.cwd(root).quiet(),
      catch: (cause) => new Error(`bun install --frozen-lockfile: ${String(cause)}`),
    }),
  ),
  Effect.tap((written) =>
    Effect.sync(() =>
      console.log(
        `${version} にした: ${Arr.map(written, ({ manifest }) => manifest.name).join(", ")}`,
      ),
    ),
  ),
)

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
