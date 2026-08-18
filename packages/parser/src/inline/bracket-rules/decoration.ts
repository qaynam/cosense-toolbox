import { Option } from 'effect'
import { shiftOrigin } from '../../core/position'
import type { BracketRule } from '../types'

/** 先頭の装飾記号の run と、空白を挟んだ中身。 */
const DECORATION_RE = /^([*/\-_]+)\s+([\s\S]+)$/

const MAX_SIZE_LEVEL = 4

/**
 * `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合 (`[-/ x]`)。
 *
 * 中身はリンクやアイコンとして再帰的に解釈するが、**装飾の入れ子は不可**
 * (本家準拠)。そのため子の走査は allowDecoration=false で行う。
 * 例: `[* [* 太字]ですね]` の内側は装飾ではなく内部リンクになる。
 */
export const decorationRule: BracketRule = (inner, ctx) => {
  if (!ctx.allowDecoration) return Option.none()

  const match = inner.match(DECORATION_RE)
  if (!match) return Option.none()

  const marks = match[1] ?? ''
  const value = match[2] ?? ''
  const stars = (marks.match(/\*/g) ?? []).length

  // 正規表現が末尾まで貪欲にマッチするので、中身は inner の末尾側の部分文字列になる。
  const valueOffset = inner.length - value.length

  return Option.some({
    type: 'decoration',
    value,
    bold: stars > 0,
    italic: marks.includes('/'),
    strike: marks.includes('-'),
    underline: marks.includes('_'),
    sizeLevel: Math.min(Math.max(stars - 1, 0), MAX_SIZE_LEVEL),
    children: ctx.tokenize(value, shiftOrigin(ctx.innerOrigin, valueOffset), false),
  })
}
