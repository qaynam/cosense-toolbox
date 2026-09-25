/**
 * table-cell-line-breaks.ts — テーブルのセルの中の文字列を改行にする描画の拡張。
 *
 * Cosense のセルには改行を書けないので、`\n` のような文字の並びを代わりに書いておき、
 * 描画のときに `<br>` にする。記法ではなく見た目の約束なので、パーサーではなく描画の拡張にしている。
 */
import { Match, Option, pipe } from 'effect'
import type { Element, ElementContent, Text } from 'hast'
import type { HtmlClassNames, RenderExtension } from './to-hast'

const lineBreak = (): Element => ({ type: 'element', tagName: 'br', properties: {}, children: [] })

/** 文字列を `marker` で区切り、間に `<br>` を挟む。空になった部分は出さない。 */
const breakText = (value: string, marker: string): ElementContent[] =>
  value
    .split(marker)
    .flatMap((part, index): ElementContent[] => [
      ...(index === 0 ? [] : [lineBreak()]),
      ...(part === '' ? [] : [{ type: 'text', value: part } satisfies Text]),
    ])

const classNamesOf = (element: Element): readonly string[] =>
  pipe(
    Option.fromNullable(element.properties.className),
    Option.map((names) => (Array.isArray(names) ? names.map(String) : String(names).split(/\s+/))),
    Option.getOrElse((): readonly string[] => []),
  )

/**
 * 書いたままの文字を出す要素。中の文字は記法の一部 (コード・数式・リンクの表示) なので改行にしない。
 * 数式は `\nu` のように marker と同じ並びを含みうる。
 */
const isVerbatim =
  (classNames: HtmlClassNames) =>
  (element: Element): boolean =>
    element.tagName === 'code' ||
    element.tagName === 'a' ||
    pipe(
      Option.fromNullable(classNames.formula),
      Option.map((formula) => formula.split(/\s+/).filter((name) => name !== '')),
      Option.filter((names) => names.length > 0),
      Option.exists((names) => names.every((name) => classNamesOf(element).includes(name))),
    )

/**
 * テーブルのセルの中の `marker` を `<br>` にする描画の拡張。
 *
 * `marker` は文字列そのままで探す (正規表現としては読まない)。区切った文字は通常どおりエスケープされる。
 * 当てるのはセルの中の文字だけで、コード・数式・リンクの表示の中には当てない。装飾の中には当てる。
 * `marker` が空文字なら何もしない。
 *
 * @example
 * toHtml(page, { extensions: [tableCellLineBreaks('\\n')] })
 */
export const tableCellLineBreaks = (marker: string): RenderExtension => ({
  tableCell: (output, _node, ctx) => {
    const verbatim = isVerbatim(ctx.options.classNames)
    const breakLines = (content: ElementContent): ElementContent[] =>
      Match.value(content).pipe(
        Match.when({ type: 'text' }, (text) => breakText(text.value, marker)),
        Match.when({ type: 'element' }, (element) =>
          verbatim(element)
            ? [element]
            : [{ ...element, children: element.children.flatMap(breakLines) }],
        ),
        Match.orElse((other) => [other]),
      )
    return marker === '' ? output : output.flatMap(breakLines)
  },
})
