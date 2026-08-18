import { Option } from 'effect'
import type { BracketRule } from '../types'

/**
 * `[title]` — 他のどのルールにも当たらなかった角括弧は内部リンクになる。
 * 常に Some を返す catch-all なので、ルール配列の最後に置くこと。
 */
export const internalLinkRule: BracketRule = (inner) =>
  Option.some({ type: 'internalLink', label: inner, target: inner })
