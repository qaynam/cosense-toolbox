import { Option } from 'effect'
import type { BracketRule } from '../types'

/** `[$ x^2]` — 中身は解釈せず生のまま返す (KaTeX 等に渡す想定)。 */
export const formulaRule: BracketRule = (inner) =>
  inner.startsWith('$')
    ? Option.some({ type: 'formula', value: inner.slice(1).trim() })
    : Option.none()
