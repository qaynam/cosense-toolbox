/**
 * `@cosense-toolbox/parser/extensions` — 記法を足すための型と、既製の拡張。
 *
 * 拡張を使わない利用者のバンドルに入らないよう、メインエントリからは切り離してある。
 * コンパイラを書くための型 (`NodeHandlers` 等) は `./compile` にある。
 */
export { customDecorations } from './custom-decoration'
export type { Origin } from '../core/position'
export type {
  BracketRule,
  BracketRuleContext,
  ConstructMatch,
  Extension,
  InlineConstruct,
  InlineContext,
} from '../inline/types'
export type { InlineNodeInit, WithoutPosition } from '../types'
