/**
 * 公開の型 (`.d.ts`) に effect の型が出ているところを探す。
 *
 * 出ていれば、そのパッケージを使う人は effect を入れて、その型を扱わないといけなくなる。
 * import が残っているだけで使われていないものは、利用者に何も求めないので見逃す
 * (宣言を束ねるときに、実装が使っていた import がそのまま残ることがある)。
 */
import { Array as Arr, Option, pipe, String as Str } from "effect"

export interface Leak {
  /** 1 から数えた行 */
  readonly line: number
  /** 出ている名前。import した名前か、`import("effect")` */
  readonly name: string
}

const EFFECT_IMPORT = /^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']effect(?:\/[^"']*)?["'];?\s*$/

const INLINE_IMPORT = /import\(\s*["']effect(?:\/[^"']*)?["']\s*\)/

const INLINE_NAME = 'import("effect")'

/** `{ Option, type Effect, Schema as S }` の中の、ファイルの中で使う名前。 */
const localNamesOf = (specifiers: string): ReadonlyArray<string> =>
  pipe(
    specifiers.split(","),
    Arr.map((specifier) => Str.trim(specifier).replace(/^type\s+/, "")),
    Arr.filter(Str.isNonEmpty),
    Arr.flatMap((specifier) => Option.toArray(Arr.last(specifier.split(/\s+as\s+/)))),
    Arr.map(Str.trim),
  )

/** コメントを空白にする。行の数は変えない (見つけた行を正しく知らせるため)。 */
const withoutComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    // `https://` のように文字列の中にある // は残す
    .replace(/(^|\s)\/\/[^\n]*/g, "$1")

/** effect から import した `name` を、別の名前の一部や `x.name` ではなく、それとして使っている。 */
const usageOf = (name: string): RegExp =>
  new RegExp(`(?<![\\w$.])${name.replace(/[$]/g, "\\$")}\\b`)

export const leaksOf = (dts: string): ReadonlyArray<Leak> => {
  const lines = withoutComments(dts).split("\n")
  const usages = pipe(
    lines,
    Arr.flatMap((line) =>
      pipe(
        Option.fromNullable(EFFECT_IMPORT.exec(line)?.[1]),
        Option.match({ onNone: () => [], onSome: localNamesOf }),
      ),
    ),
    Arr.map((name) => ({ name, pattern: usageOf(name) })),
  )

  return pipe(
    lines,
    Arr.flatMap((line, index): ReadonlyArray<Leak> =>
      EFFECT_IMPORT.test(line)
        ? []
        : pipe(
            [
              ...(INLINE_IMPORT.test(line) ? [INLINE_NAME] : []),
              ...pipe(
                usages,
                Arr.filter(({ pattern }) => pattern.test(line)),
                Arr.map(({ name }) => name),
              ),
            ],
            Arr.map((name) => ({ line: index + 1, name })),
          ),
    ),
  )
}
