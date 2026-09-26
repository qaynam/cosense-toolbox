import type { AnyNode } from "@cosense-toolbox/parser"
import { visit } from "@cosense-toolbox/parser/utils"

/** What one node gives, and whether its children are read too. */
export interface Picked<A> {
  readonly items: ReadonlyArray<A>
  readonly descend: boolean
}

export const leaf = <A>(items: ReadonlyArray<A>): Picked<A> => ({ items, descend: false })

export const branch = <A>(items: ReadonlyArray<A>): Picked<A> => ({ items, descend: true })

/**
 * Everything `pick` takes from `tree`, in document order.
 *
 * The parser's `visit` hands nodes to a callback, so something has to hold what the callback
 * finds. That is kept to here: `pick` stays a pure function of one node.
 */
export const gather = <A>(tree: AnyNode, pick: (node: AnyNode) => Picked<A>): ReadonlyArray<A> => {
  const found: A[] = []
  visit(tree, (node) => {
    const { items, descend } = pick(node)
    found.push(...items)
    return descend ? undefined : "skip"
  })
  return found
}
