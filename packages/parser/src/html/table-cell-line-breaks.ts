/**
 * table-cell-line-breaks.ts — テーブルのセルの中の文字列を改行にする描画の拡張。
 *
 * Cosense のセルには改行を書けないので、`\n` のような文字の並びを代わりに書いておき、
 * 描画のときに `<br>` にする。記法ではなく見た目の約束なので、パーサーではなく描画の拡張にしている。
 */
import type { Element, ElementContent, Text } from 'hast'
import type { RenderExtension } from './to-hast'

const lineBreak = (): Element => ({ type: 'element', tagName: 'br', properties: {}, children: [] })

/** 文字列を `marker` で区切り、間に `<br>` を挟む。空になった部分は出さない。 */
const breakText = (value: string, marker: string): ElementContent[] =>
  value
    .split(marker)
    .flatMap((part, index): ElementContent[] => [
      ...(index === 0 ? [] : [lineBreak()]),
      ...(part === '' ? [] : [{ type: 'text', value: part } satisfies Text]),
    ])

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
    marker !== '' && ctx.ancestors.some((ancestor) => ancestor.type === 'tableCell')
      ? output.flatMap((content) =>
          content.type === 'text' ? breakText(content.value, marker) : [content],
        )
      : output,
})
