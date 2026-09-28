/**
 * workspaces.ts — リポジトリの `packages/*` を、公開の判定に使える形で読む。
 */
import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { Array as Arr, Effect, pipe } from "effect"

import type { Manifest, Workspace } from "./release"

const exists = (path: string): Effect.Effect<boolean> =>
  pipe(
    Effect.tryPromise(() => access(path)),
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )

/** `packages/<name>` の 1 つ。package.json を読めなければ None。 */
const readWorkspace = (root: string, dir: string) =>
  pipe(
    Effect.tryPromise(() => readFile(join(root, dir, "package.json"), "utf8")),
    Effect.map((text): Manifest => JSON.parse(text) as Manifest),
    Effect.zip(exists(join(root, dir, "LICENSE"))),
    Effect.map(([manifest, hasLicense]): Workspace => ({ dir, manifest, hasLicense })),
    Effect.option,
  )

/** `root` の `packages/*` を、名前の順に読む。 */
export const readWorkspaces = (root: string): Effect.Effect<ReadonlyArray<Workspace>, Error> =>
  pipe(
    Effect.tryPromise({
      try: () => readdir(join(root, "packages")),
      catch: (cause) => new Error(`packages/ を読めない: ${String(cause)}`),
    }),
    // package.json を読めないもの (ファイルや空のディレクトリ) は、readWorkspace が外す。
    Effect.map((names) =>
      pipe(
        Arr.map(names, (name) => `packages/${name}`),
        Arr.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    ),
    Effect.flatMap(Effect.forEach((dir) => readWorkspace(root, dir))),
    Effect.map(Arr.getSomes),
  )
