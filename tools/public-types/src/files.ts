/**
 * どのファイルを調べるか。ビルドした `dist` の中の型の宣言のうち、effect のまま使ってよいと
 * 決めた入口 (parser の `./schema` のように、effect を使う人のために置いたもの) を除いたもの。
 */
import { Array as Arr, Option, pipe } from "effect"

const DECLARATION = /\.d\.[cm]?ts$/

/** `schema.d.mts` なら `schema`。`dist` の中のパスから、宣言が属する入口の名前を取る。 */
const entryOf = (path: string): string =>
  (path.split(/[\\/]/).at(-1) ?? path).replace(DECLARATION, "")

export const declarationsToCheck = (
  paths: ReadonlyArray<string>,
  allowed: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  pipe(
    paths,
    Arr.filter((path) => DECLARATION.test(path)),
    Arr.filter((path) => !allowed.includes(entryOf(path))),
  )

/** コマンドの引数の `--allow <入口>` から、effect のまま使ってよい入口を集める。 */
export const allowedEntriesOf = (args: ReadonlyArray<string>): ReadonlyArray<string> =>
  pipe(
    args,
    Arr.flatMap((arg, index) =>
      arg === "--allow" ? Option.toArray(Arr.get(args, index + 1)) : [],
    ),
  )
