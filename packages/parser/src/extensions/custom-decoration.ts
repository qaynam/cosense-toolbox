import { Option } from 'effect'

import { buildDecorationRule, OFFICIAL_MARKERS } from '../inline/bracket-rules/decoration'
import type { Extension } from '../inline/types'

/**
 * 文字装飾記法として読む記号を増やす拡張。
 *
 * 既定では `* / - _` の 4 つだけを装飾として読み、それ以外は内部リンクになる。
 * 渡した記号は既定の記号と混ぜられ、`[*' x]` は太字かつ `markers: ['*', "'"]` になる。
 */
export const customDecorations = (markers: readonly string[]): Extension => {
  const rule = buildDecorationRule(OFFICIAL_MARKERS + markers.join(''))
  // 拡張のルールは null で返す形なので、中のルールの Option を外す。
  return { bracketRules: [(inner, ctx) => Option.getOrNull(rule(inner, ctx))] }
}
