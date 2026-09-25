/**
 * code-line-numbers.ts — コードブロックに行番号を付ける描画の拡張。
 */
import { Match, Option, pipe } from "effect"
import type { ElementContent } from "hast"

import type { RenderExtension } from "./to-hast"

/** 行の要素に行番号と桁数を付ける。要素でないもの (テキストなど) には付ける場所が無いのでそのまま。 */
const withLineNumber =
  (digits: number) =>
  (line: ElementContent, number: number): ElementContent =>
    Match.value(line).pipe(
      Match.when({ type: "element" }, (element) => ({
        ...element,
        properties: { ...element.properties, dataLine: number, dataLineDigits: digits },
      })),
      Match.orElse(() => line),
    )

/**
 * コードブロックの出力 (先頭がヘッダ行、続いて本体行) に行番号を付ける。
 * 本体行が行の数だけ並んでいるときだけ付ける。ひと塊にまとめた出力や、
 * `handlers` が別の形に置き換えた出力では、行と番号が対応しないため。
 */
const numberLines = (output: ElementContent[], count: number): ElementContent[] =>
  pipe(
    Option.some(output),
    Option.filter((lines) => lines.length === count + 1),
    Option.map(([header, ...body]) => {
      // 番号の欄の幅を CSS が決められるよう、ブロックで一番大きい番号の桁数を全行に付ける。
      const number = withLineNumber(String(count).length)
      return [
        ...Option.toArray(Option.fromNullable(header)),
        ...body.map((line, index) => number(line, index + 1)),
      ]
    }),
    Option.getOrElse(() => output),
  )

/**
 * コードブロックの本体行に、1 から数えた行番号 (`data-line`) と桁数 (`data-line-digits`) を付ける拡張。
 *
 * ```ts
 * toHtml(page, { extensions: [codeLineNumbers()] })
 * ```
 *
 * 番号を見せるのは CSS の役目 (`@cosense-toolbox/style` は `data-line` を見て行の左に番号を出す)。
 * 色付けしてひと塊にまとめたブロックは、行と番号が対応しないので付けない。
 */
export const codeLineNumbers = (): RenderExtension => ({
  codeBlock: (output, node) => numberLines(output, node.lines.length),
})
