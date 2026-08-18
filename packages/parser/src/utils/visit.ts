/**
 * visit.ts — unist-util-visit 風の走査。外部依存を増やさないための自前実装。
 */
import { childrenOf } from '../ast'
import type { AnyNode, AnyNodeType, NodeOfType } from '../types'

/**
 * visitor の戻り値。
 * - 何も返さない — そのまま子へ進む
 * - `'skip'` — このノードの子を辿らない
 * - `'exit'` — 走査全体を打ち切る
 */
// biome-ignore lint/suspicious/noConfusingVoidType: undefined だと値を返さない visitor を渡せない
export type VisitResult = void | 'skip' | 'exit'

export type Visitor<T extends AnyNode> = (node: T, ancestors: readonly AnyNode[]) => VisitResult

/** 木を深さ優先で辿る。`types` を渡すとその型のノードだけが visitor に届く。 */
export function visit(tree: AnyNode, visitor: Visitor<AnyNode>): void
export function visit<K extends AnyNodeType>(
  tree: AnyNode,
  types: K | readonly K[],
  visitor: Visitor<NodeOfType<K>>,
): void
export function visit(
  tree: AnyNode,
  typesOrVisitor: AnyNodeType | readonly AnyNodeType[] | Visitor<AnyNode>,
  maybeVisitor?: Visitor<AnyNode>,
): void {
  const visitor = maybeVisitor ?? (typesOrVisitor as Visitor<AnyNode>)
  const types =
    maybeVisitor === undefined
      ? undefined
      : new Set(
          typeof typesOrVisitor === 'string'
            ? [typesOrVisitor]
            : (typesOrVisitor as readonly AnyNodeType[]),
        )

  const walk = (node: AnyNode, ancestors: readonly AnyNode[]): VisitResult => {
    if (types === undefined || types.has(node.type)) {
      const result = visitor(node, ancestors)
      if (result === 'exit') return 'exit'
      if (result === 'skip') return undefined
    }
    const nextAncestors = [...ancestors, node]
    for (const child of childrenOf(node)) {
      if (walk(child, nextAncestors) === 'exit') return 'exit'
    }
    return undefined
  }

  walk(tree, [])
}

/** その型の最初のノードを返す。無ければ null。 */
export function find<K extends AnyNodeType>(tree: AnyNode, type: K): NodeOfType<K> | null {
  let found: NodeOfType<K> | null = null
  visit(tree, type, (node) => {
    found = node
    return 'exit'
  })
  return found
}

/** その型のノードを出現順にすべて集める。 */
export function collect<K extends AnyNodeType>(tree: AnyNode, type: K): NodeOfType<K>[] {
  const out: NodeOfType<K>[] = []
  visit(tree, type, (node) => {
    out.push(node)
  })
  return out
}
