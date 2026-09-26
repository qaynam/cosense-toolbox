import { Option } from "effect"

import { shiftOrigin } from "../../core/position"
import type { InlineNodeInit } from "../../types"
import type { InternalBracketRule } from "../internal-types"
import type { BracketRuleContext } from "../types"

/** 意味を持つ文字装飾記法の記号。 */
export const OFFICIAL_MARKERS = "*/-_"

const MAX_SIZE_LEVEL = 4

/** 文字クラスの中で特別扱いされる文字を潰す。 */
const escapeForCharClass = (chars: string): string => chars.replace(/[\\\]^-]/g, "\\$&")

/** 出現順を保ったまま重複を落とす。`[*** x]` の markers は `['*']` になる。 */
const uniqueChars = (marks: string): readonly string[] => [...new Set(marks)]

/**
 * `[<記号> 中身]` を文字装飾記法として読む。`markerChars` に含まれる記号だけを受け付ける。
 *
 * 中身はリンクやアイコンとして再帰的に解釈するが、**装飾の入れ子は不可**。
 * そのため子の走査は allowDecoration=false で行う。
 * 例: `[* [* 太字]ですね]` の内側は装飾ではなく内部リンクになる。
 */
/**
 * 文脈は拡張に渡るものと同じ形 (`BracketRuleContext`) だけを使う。
 * `customDecorations` が拡張のルールとしても使うため。
 */
export const buildDecorationRule = (
  markerChars: string,
): ((inner: string, ctx: BracketRuleContext) => Option.Option<InlineNodeInit>) => {
  const pattern = new RegExp(`^([${escapeForCharClass(markerChars)}]+)\\s+([\\s\\S]+)$`)

  return (inner, ctx) => {
    if (!ctx.allowDecoration) return Option.none()

    const match = inner.match(pattern)
    if (!match) return Option.none()

    const marks = match[1] ?? ""
    const value = match[2] ?? ""
    const stars = (marks.match(/\*/g) ?? []).length

    // 正規表現が末尾まで貪欲にマッチするので、中身は inner の末尾側の部分文字列になる。
    const valueOffset = inner.length - value.length

    return Option.some({
      type: "decoration",
      value,
      markers: uniqueChars(marks),
      bold: stars > 0,
      italic: marks.includes("/"),
      strike: marks.includes("-"),
      underline: marks.includes("_"),
      sizeLevel: Math.min(Math.max(stars - 1, 0), MAX_SIZE_LEVEL),
      children: ctx.tokenize(value, shiftOrigin(ctx.innerOrigin, valueOffset), false),
    })
  }
}

/** `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合 (`[-/ x]`)。 */
export const decorationRule: InternalBracketRule = buildDecorationRule(OFFICIAL_MARKERS)
