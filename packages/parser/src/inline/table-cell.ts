/**
 * table-cell.ts — テーブルのセルの中の記法。
 *
 * Cosense Web はセルの中ではリンクの記法 (`[title]` / `[https://…]` / `[/project/page]` /
 * 裸の URL / `#tag`) だけを読み、それ以外は書いたままの文字として出す。
 * ここでは行と同じ規則でいったん読み、リンク以外のノードを書いたままの文字に戻す。
 * 最初からリンクの規則だけで読むと、`[* 太字]` が `* 太字` というページへのリンクになってしまうため。
 */
import { type Origin, spanAt } from '../core/position'
import type { InlineNode, TextNode } from '../types'

/** セルの中でも記法として残すノード。 */
const LINK_TYPES: ReadonlySet<InlineNode['type']> = new Set([
  'internalLink',
  'externalLink',
  'projectLink',
  'hashtag',
])

/**
 * 行と同じ規則で読んだセルのノード列から、リンク以外を書いたままの文字に戻す。
 * `source` はセルの中身、`origin` はその先頭のソース上の位置。
 *
 * 装飾は記号の部分だけを文字に戻し、中身は同じように辿る。`[* [リンク]]` の中のリンクは残す。
 */
export const keepOnlyLinks = (
  nodes: readonly InlineNode[],
  source: string,
  origin: Origin,
): readonly InlineNode[] => {
  /** ソース上の `[start, end)` を、書いたままの文字のノードにする。 */
  const literal = (start: number, end: number): readonly TextNode[] =>
    start >= end
      ? []
      : [
          {
            type: 'text',
            value: source.slice(start - origin.offset, end - origin.offset),
            position: spanAt(origin, start - origin.offset, end - origin.offset),
          },
        ]

  const demote = (node: InlineNode): readonly InlineNode[] => {
    if (node.type === 'text' || LINK_TYPES.has(node.type)) return [node]
    const { start, end } = node.position
    const first = node.type === 'decoration' ? node.children[0] : undefined
    const last = node.type === 'decoration' ? node.children[node.children.length - 1] : undefined
    if (node.type !== 'decoration' || first === undefined || last === undefined) {
      return literal(start.offset, end.offset)
    }
    return [
      ...literal(start.offset, first.position.start.offset),
      ...node.children.flatMap(demote),
      ...literal(last.position.end.offset, end.offset),
    ]
  }

  return mergeTexts(nodes.flatMap(demote))
}

/** 隣り合う text ノードを 1 つにまとめる。行を読んだときと同じ形にするため。 */
const mergeTexts = (nodes: readonly InlineNode[]): readonly InlineNode[] => {
  const merged: InlineNode[] = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (node.type === 'text' && previous?.type === 'text') {
      merged[merged.length - 1] = {
        type: 'text',
        value: previous.value + node.value,
        position: { start: previous.position.start, end: node.position.end },
      }
    } else {
      merged.push(node)
    }
  }
  return merged
}
