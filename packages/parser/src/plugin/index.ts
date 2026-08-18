/**
 * `@cosense-toolbox/parser/plugin` — プラグイン作者向けの型。
 *
 * 記法を足すプラグインは `Extension` を作って `parse(source, { extensions })` に渡す。
 * 出力形式を足すプラグインは `NodeHandlers` を書いて `createCompiler` に渡す。
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
