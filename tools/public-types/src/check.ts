#!/usr/bin/env bun
/**
 * パッケージの公開の型に effect の型が出ていないかを調べる。パッケージのディレクトリで、
 * ビルドの後に動かす (各パッケージの `check:public-types`)。
 *
 *   bun ../../tools/public-types/src/check.ts [--allow <入口>]...
 *
 * 出ていれば、場所を出して 1 で終わる。中は effect で書いてよいが、使う人に見える型は
 * `T | null` や `Promise<T>` にする (パッケージの入口で包む)。`--allow` には、effect を使う人の
 * ために effect の型のまま出すと決めた入口 (parser の `schema`) を書く。
 */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { Array as Arr, Effect, pipe } from "effect"

import { allowedEntriesOf, declarationsToCheck } from "./files"
import { type Leak, leaksOf } from "./leaks"

const dist = join(process.cwd(), "dist")
const allowed = allowedEntriesOf(process.argv.slice(2))

const read = <A>(what: string, read: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({ try: read, catch: (cause) => new Error(`${what}: ${String(cause)}`) })

const reportOf =
  (path: string) =>
  ({ line, name }: Leak): string =>
    `dist/${path}:${line}: 公開の型に effect の ${name} が出ている`

const program = pipe(
  read("dist を読めない (先にビルドする)", () => readdir(dist, { recursive: true })),
  Effect.map((paths) => declarationsToCheck(paths, allowed)),
  Effect.filterOrFail(
    Arr.isNonEmptyReadonlyArray,
    () => new Error("dist に型の宣言が無い (先にビルドする)"),
  ),
  Effect.flatMap((paths) =>
    Effect.forEach(paths, (path) =>
      Effect.map(
        read(path, () => readFile(join(dist, path), "utf8")),
        (text) => Arr.map(leaksOf(text), reportOf(path)),
      ),
    ),
  ),
  Effect.map(Arr.flatten),
  Effect.flatMap((reports) =>
    Arr.isNonEmptyReadonlyArray(reports)
      ? Effect.fail(new Error(reports.join("\n")))
      : Effect.sync(() => console.log("公開の型に effect の型は出ていない")),
  ),
  Effect.catchAll((error) =>
    Effect.sync(() => {
      console.error(error.message)
      process.exitCode = 1
    }),
  ),
)

Effect.runPromise(program)
