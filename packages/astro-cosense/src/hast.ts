/**
 * hast.ts — `.csn` / `.csnx` の hast をたどる。
 *
 * cosense-x のコンポーネントのノードは、渡されなかったときに出す元の行を `fallback` / `fallbackEnd` に持つ。
 * それは `children` に入っていないので、unist-util-visit ではたどれない。
 */

export interface HastLike {
  readonly type?: string
  readonly tagName?: string
  readonly properties?: Record<string, unknown>
  readonly children?: readonly HastLike[]
  readonly fallback?: HastLike | null
  readonly fallbackEnd?: HastLike | null
}

/** `node` とその下にある、`tagName` の要素。コンポーネントの fallback の中も含む。 */
export const elementsIn = (node: HastLike, tagName: string): HastLike[] => {
  const own = node.type === "element" && node.tagName === tagName ? [node] : []
  const nested = [...(node.children ?? []), node.fallback, node.fallbackEnd].filter(
    (child): child is HastLike => child !== null && child !== undefined,
  )
  return [...own, ...nested.flatMap((child) => elementsIn(child, tagName))]
}
