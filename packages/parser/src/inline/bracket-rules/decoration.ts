import { Option } from "effect"

import { shiftOrigin } from "../../core/position"
import type { InternalBracketRule } from "../internal-types"

/**
 * `[<記号の並び> 中身]`。記号は Cosense の文字装飾の記号 `` !"#%&'()*+,-./{|}<>_~ `` で、
 * Cosense Web はこの集合からなる並びをすべて装飾として読む (help-jp「文字装飾記法」)。
 * どの記号が装飾になるかは構文なので、設定で変えられるようにしない。
 * `$` (数式) と `[` (`[[強調]]`) は別の記法なので含まれない。
 *
 * 文字列から組み立てずに正規表現のリテラルで持つのは、トップレベルで関数を呼ばないため
 * (`sideEffects: false`)。
 */
const DECORATION_PATTERN = /^([!"#%&'()*+,\-./{|}<>_~]+)\s+([\s\S]+)$/

/**
 * 見た目が決まっている記号。bold などのフラグはこれだけから決める。
 * ほかの記号は `markers` に残るだけで、見た目はプロジェクトの UserCSS が付ける。
 */
const STYLED_MARKERS = { bold: "*", italic: "/", strike: "-", underline: "_" } as const

const MAX_SIZE_LEVEL = 4

/** 出現順を保ったまま重複を落とす。`[*** x]` の markers は `['*']` になる。 */
const uniqueChars = (marks: string): readonly string[] => [...new Set(marks)]

/**
 * `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合 (`[-/ x]`)、
 * および見た目の付かない記号の装飾 (`[! 注意]`)。
 *
 * 中身はリンクやアイコンとして再帰的に解釈するが、**装飾の入れ子は不可**。
 * そのため子の走査は allowDecoration=false で行う。
 * 例: `[* [* 太字]ですね]` の内側は装飾ではなく内部リンクになる。
 */
export const decorationRule: InternalBracketRule = (inner, ctx) => {
  if (!ctx.allowDecoration) return Option.none()

  const match = inner.match(DECORATION_PATTERN)
  if (!match) return Option.none()

  const marks = match[1] ?? ""
  const value = match[2] ?? ""
  const stars = [...marks].filter((mark) => mark === STYLED_MARKERS.bold).length

  // 正規表現が末尾まで貪欲にマッチするので、中身は inner の末尾側の部分文字列になる。
  const valueOffset = inner.length - value.length

  return Option.some({
    type: "decoration",
    value,
    markers: uniqueChars(marks),
    bold: stars > 0,
    italic: marks.includes(STYLED_MARKERS.italic),
    strike: marks.includes(STYLED_MARKERS.strike),
    underline: marks.includes(STYLED_MARKERS.underline),
    sizeLevel: Math.min(Math.max(stars - 1, 0), MAX_SIZE_LEVEL),
    children: ctx.tokenize(value, shiftOrigin(ctx.innerOrigin, valueOffset), false),
  })
}
