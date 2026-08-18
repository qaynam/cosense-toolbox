/**
 * create-compiler.ts — AST を任意の形式に変換する土台。
 *
 * ノード型ごとのハンドラを差し替えるだけで出力を変えられるので、
 * 一部のノードだけ出力を上書きしたい利用者は残りを fallback に任せられる。
 */
import { childrenOf } from '../ast'
import type { AnyNode, AnyNodeType, NodeOfType } from '../types'

/** ハンドラの中から再帰的に変換するための入口。 */
export interface CompileContext<Out> {
  /** 1 ノードを変換する */
  readonly node: (node: AnyNode) => Out
  /** 子ノードをまとめて変換する */
  readonly children: (node: AnyNode) => Out[]
}

export type NodeHandler<Out, K extends AnyNodeType> = (
  node: NodeOfType<K>,
  ctx: CompileContext<Out>,
) => Out

/**
 * ノード型 → ハンドラの対応。`AnyNodeMap` から型を導出しているので、
 * ノード型が増えたらここも自動で新しいキーを受け入れる。
 */
export type NodeHandlers<Out> = {
  readonly [K in AnyNodeType]?: NodeHandler<Out, K>
}

export interface CompilerOptions<Out> {
  readonly handlers: NodeHandlers<Out>
  /** ハンドラが無いノード型に使う既定の変換 */
  readonly fallback: NodeHandler<Out, AnyNodeType>
}

/** AST をひとつの値に変換する関数を作る。 */
export const createCompiler = <Out>(options: CompilerOptions<Out>) => {
  const compile = (node: AnyNode): Out => {
    // ハンドラの型はキーごとに異なるが、node.type でキーを引いている以上一致する。
    const handler = options.handlers[node.type] as NodeHandler<Out, AnyNodeType> | undefined
    return (handler ?? options.fallback)(node, ctx)
  }
  const ctx: CompileContext<Out> = {
    node: compile,
    children: (node) => childrenOf(node).map(compile),
  }
  return compile
}
