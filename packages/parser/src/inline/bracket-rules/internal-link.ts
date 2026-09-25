import { Option } from 'effect'

import type { InternalBracketRule } from '../internal-types'

/**
 * `[title]` — 他のどのルールにも当たらなかった角括弧は内部リンクになる。
 * 常に Some を返す catch-all なので、ルール配列の最後に置くこと。
 */
export const internalLinkRule: InternalBracketRule = (inner) =>
  Option.some({ type: 'internalLink', label: inner, target: inner })
