/**
 * dollar-math.ts — `$...$` を数式とみなす決まりを pandoc にそろえる。
 *
 * CommonMark にも GFM にも数式の記法は無く、`$...$` は pandoc などが広めた拡張。
 * remark-math (`micromark-extension-math`) は `$` が 2 つあればその間を数式にするので、
 * `$5と$10` のような値段まで数式になる。pandoc は次のどれかに当てはまる `$...$` を数式にしない。
 *
 * - 開く `$` のすぐ後が空白
 * - 閉じる `$` のすぐ前が空白
 * - 閉じる `$` のすぐ後が数字
 *
 * remark-math が読んだ数式のうち、これに当てはまるものを書かれたとおりの文字に戻す。
 * 戻した `$` を、後ろの別の `$` と組み直すことはしない (pandoc は組み直す)。
 * `$$...$$` は値段と紛れないので、そのまま数式にする。
 */
import { Option, pipe } from "effect"
import type { Nodes, PhrasingContent, Root } from "mdast"
import type { InlineMath } from "mdast-util-math"

const isPandocMath = (written: string, next: string): boolean =>
  !/^\$\s/.test(written) && !/\s\$$/.test(written) && !/^\d/.test(next)

/** pandoc では数式にならない `$...$` を、書かれたとおりの文字にする。 */
const asPandocReads = (node: InlineMath, markdown: string): PhrasingContent =>
  pipe(
    Option.all([
      Option.fromNullable(node.position?.start.offset),
      Option.fromNullable(node.position?.end.offset),
    ]),
    Option.map(([start, end]) => ({
      written: markdown.slice(start, end),
      next: markdown.charAt(end),
    })),
    Option.filter(({ written, next }) => !written.startsWith("$$") && !isPandocMath(written, next)),
    Option.match({
      onNone: (): PhrasingContent => node,
      onSome: ({ written }): PhrasingContent => ({ type: "text", value: written }),
    }),
  )

const visitInlineMath = (node: Nodes, markdown: string): Nodes =>
  node.type === "inlineMath"
    ? asPandocReads(node, markdown)
    : "children" in node
      ? ({
          ...node,
          children: node.children.map((child) => visitInlineMath(child, markdown)),
        } as Nodes)
      : node

/** `markdown` を読んだ木 `root` の `$...$` の数式を、pandoc が数式にするものだけに絞る。 */
export const toPandocDollarMath = (root: Root, markdown: string): Root =>
  visitInlineMath(root, markdown) as Root
