/**
 * ast.ts — AST に対する基本操作。パースはしない。
 */
import type { AnyNode } from './types'

/** 型を知らないノードの子。mdast と同じく `children` 配列があればそれが子。 */
const unknownChildren = (node: unknown): readonly AnyNode[] => {
  const children = (node as { readonly children?: unknown }).children
  return Array.isArray(children) ? (children as readonly AnyNode[]) : []
}

/**
 * ノードの子を返す。子を持たないノードでは空配列。
 *
 * どのフィールドが子にあたるかはノード型ごとに違う (`children` / `lines` / `rows` / `cells`)。
 * その対応を知っているのはここだけで、AST を辿るコードはすべてこれを通る。
 */
export const childrenOf = (node: AnyNode): readonly AnyNode[] => {
  switch (node.type) {
    case 'page':
      return node.children
    case 'title':
      return node.children
    case 'codeBlock':
      return node.lines
    case 'table':
      return node.rows
    case 'tableRow':
      return node.cells
    case 'line':
      return node.children
    case 'decoration':
      return node.children
    case 'codeLine':
    case 'tableCell':
    case 'text':
    case 'internalLink':
    case 'externalLink':
    case 'projectLink':
    case 'hashtag':
    case 'inlineCode':
    case 'image':
    case 'icon':
    case 'formula':
      return []
    default: {
      // ノード型を足したのにここを更新していないとコンパイルエラーになる。
      node satisfies never
      // 型の上では到達しないが、実行時には declaration merging でノード型を足した
      // プラグインのノードが来うる。
      return unknownChildren(node)
    }
  }
}

/** そのノードがソース上で占めていた生のテキスト。位置情報から復元する。 */
export const rawTextOf = (source: string, node: AnyNode): string =>
  source.slice(node.position.start.offset, node.position.end.offset)
