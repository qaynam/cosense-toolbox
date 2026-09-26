/**
 * lint.ts — ビルドの前に、サイトのページのリンク切れを調べる。
 *
 * 判定は `@cosense-toolbox/lsp` の `checkSite` をそのまま使う。エディタの診断と
 * `csn-lsp check` と同じ関数なので、エディタで警告されるものとビルドで止まるものが一致する。
 */
import { relative, sep } from "node:path"

import { checkSite, type CheckSiteOptions, type Report } from "@cosense-toolbox/lsp/check"
import type { ParseOptions } from "@cosense-toolbox/parser"
import { Array as Arr, Effect } from "effect"

export interface CosenseLintOptions {
  /**
   * サイトに無いページへのリンクの知らせ方。`'error'` ならビルドを止める。
   * `'off'` / `'hint'` / `'information'` / `'warning'` / `'error'`。
   *
   * @defaultValue `'warning'`
   */
  readonly unresolvedLinks?: CheckSiteOptions["unresolvedLinks"]
  /**
   * 1 行目の `---` を frontmatter (YAML) として飛ばすか。
   *
   * @defaultValue `true`
   */
  readonly frontmatter?: boolean
}

/** 見つかったもの。`errors` があればビルドを止める。 */
export interface LintResult {
  readonly errors: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
}

/** `path:line:column message`。path はプロジェクトのルートから。 */
const messageOf =
  (root: string) =>
  ({ path, line, column, message }: Report): string =>
    `${relative(root, path).split(sep).join("/")}:${line}:${column} ${message}`

/**
 * `srcDir` の下の `.csn` / `.csnx` を読み、リンク切れを調べる。
 * パースにはサイトの `parseOptions` を使うので、独自の装飾記法もビルドと同じに読む。
 */
export const lintSite = (
  root: string,
  srcDir: string,
  { unresolvedLinks = "warning", frontmatter = true }: CosenseLintOptions,
  parseOptions: ParseOptions = {},
): Effect.Effect<LintResult> =>
  Effect.map(
    checkSite({ roots: [srcDir], unresolvedLinks, parseOptions, frontmatter }),
    (reports) => {
      const [warnings, errors] = Arr.partition(reports, ({ level }) => level === "error")
      return {
        errors: Arr.map(errors, messageOf(root)),
        warnings: Arr.map(warnings, messageOf(root)),
      }
    },
  )
