/**
 * `@cosense-toolbox/parser/plugin` — 記法や出力形式を足すための型。
 * このサブパスは**型だけ**を公開し、実行時のコードを持たない。
 */
export type { Origin } from '../core/position'
export type {
  BracketRule,
  BracketRuleContext,
  ConstructMatch,
  Extension,
  InlineConstruct,
  InlineContext,
} from '../inline/types'
export type {
  CompileContext,
  CompilerOptions,
  NodeHandler,
  NodeHandlers,
} from '../compile/create-compiler'
export type { InlineNodeInit, WithoutPosition } from '../types'
