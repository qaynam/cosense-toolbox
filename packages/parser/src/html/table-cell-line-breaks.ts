/**
 * table-cell-line-breaks.ts — テーブルのセルの中の文字列を改行にする描画の拡張。
 *
 * Cosense のセルには改行を書けないので、`\n` のような文字の並びを代わりに書いておき、
 * 描画のときに `<br>` にする。記法ではなく見た目の約束なので、パーサーではなく描画の拡張にしている。
 */
import { Match, Option, pipe } from "effect"
import type { Element, ElementContent, Text } from "hast"

import type { AnyNode } from "../types"
import type { RenderExtension } from "./to-hast"

const lineBreak = (): Element => ({ type: "element", tagName: "br", properties: {}, children: [] })

/** 空でない文字列だけを text にする。区切った部分が空なら何も出さない。 */
const textOf = (value: string): Option.Option<Text> =>
  pipe(
    Option.some(value),
    Option.filter((part) => part !== ""),
    Option.map((part): Text => ({ type: "text", value: part })),
  )

/** 文字列を `marker` で区切り、間に `<br>` を挟む。 */
const breakText = (value: string, marker: string): ElementContent[] =>
  value
    .split(marker)
    .flatMap((part, index): ElementContent[] => [
      ...(index === 0 ? [] : [lineBreak()]),
      ...Option.toArray(textOf(part)),
    ])

/** 出力のうち text だけを区切る。`handlers.text` が要素を返したときは、そのまま残す。 */
const breakContent =
  (marker: string) =>
  (content: ElementContent): ElementContent[] =>
    Match.value(content).pipe(
      Match.when({ type: "text" }, (text) => breakText(text.value, marker)),
      Match.orElse((other) => [other]),
    )

const isTableCell = (node: AnyNode): boolean => node.type === "tableCell"

/**
 * テーブルのセルの中の `marker` を `<br>` にする描画の拡張。
 *
 * 当てるのは、セルの中にある AST の text ノード (記法の外の地の文) だけ。
 * コード・数式・リンクの表示は text ノードではないので、`classNames` や `handlers` で
 * 出力を変えても、その中には当たらない。装飾の中身は text ノードなので当たる。
 * `marker` は文字列そのままで探し (正規表現としては読まない)、区切った文字は通常どおりエスケープされる。
 * `marker` が空文字なら何もしない。
 *
 * @example
 * toHtml(page, { extensions: [tableCellLineBreaks('\\n')] })
 */
export const tableCellLineBreaks = (marker: string): RenderExtension => ({
  text: (output, _node, ctx) =>
    pipe(
      Option.some(marker),
      Option.filter((value) => value !== ""),
      Option.filter(() => ctx.ancestors.some(isTableCell)),
      Option.match({
        onNone: () => output,
        onSome: (value) => output.flatMap(breakContent(value)),
      }),
    ),
})
