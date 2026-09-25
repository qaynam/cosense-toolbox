/**
 * table-cell.ts — テーブルのセルの中の記法。
 *
 * Cosense Web はセルの中ではリンクの記法 (`[title]` / `[https://…]` / `[/project/page]` /
 * 裸の URL / `#tag`) だけを読み、それ以外は書いたままの文字として出す。
 * ここでは行と同じ規則でいったん読み、残さないノードを書いたままの文字に戻す。
 * 最初からリンクの規則だけで読むと、`[* 太字]` が `* 太字` というページへのリンクになってしまうため。
 *
 * どのノードを残すかは拡張の `keepInTableCell` で足せる (`tableCellNotation`)。
 */
import { Match, Option, pipe } from 'effect'
import { type Origin, spanAt } from '../core/position'
import type { Decoration, InlineNode, TextNode } from '../types'
import type { Extension } from './types'

/** セルの中でも記法として残すかどうか。 */
export type KeepInTableCell = (node: InlineNode) => boolean

/** Cosense Web がセルの中でも読む記法。 */
const LINK_TYPES: ReadonlySet<InlineNode['type']> = new Set([
  'internalLink',
  'externalLink',
  'projectLink',
  'hashtag',
])

/** リンクの記法は必ず残し、それに加えて拡張のどれかが残すと言ったノードを残す。 */
export const keepInTableCellOf = (extensions: readonly Extension[] = []): KeepInTableCell => {
  const keeps = extensions.flatMap((extension) =>
    extension.keepInTableCell === undefined ? [] : [extension.keepInTableCell],
  )
  return (node) => LINK_TYPES.has(node.type) || keeps.some((keep) => keep(node))
}

const joinTexts = (previous: TextNode, next: TextNode): TextNode => ({
  type: 'text',
  value: previous.value + next.value,
  position: { start: previous.position.start, end: next.position.end },
})

const isText = (node: InlineNode): node is TextNode => node.type === 'text'

/** `start` から続く text ノードの並び。 */
const textRunFrom = (nodes: readonly InlineNode[], start: number): readonly TextNode[] => {
  const end = nodes.findIndex((node, index) => index > start && !isText(node))
  return nodes.slice(start, end === -1 ? nodes.length : end).filter(isText)
}

/**
 * 隣り合う text ノードを 1 つにまとめる。行を読んだときと同じ形にするため。
 * text の並びの先頭で並び全体をまとめ、続きの text は先頭に含まれているので出さない。
 */
const mergeTexts = (nodes: readonly InlineNode[]): readonly InlineNode[] =>
  nodes.flatMap((node, index): readonly InlineNode[] =>
    !isText(node)
      ? [node]
      : pipe(Option.fromNullable(nodes[index - 1]), Option.exists(isText))
        ? []
        : [textRunFrom(nodes, index).reduce(joinTexts)],
  )

/**
 * 行と同じ規則で読んだセルのノード列から、`keep` が残さないノードを書いたままの文字に戻す。
 * `source` はセルの中身、`origin` はその先頭のソース上の位置。
 *
 * 装飾を残さないときは記号の部分だけを文字に戻し、中身は同じように辿る。
 * `[* [リンク]]` の中のリンクは残す。装飾を残すときも、その中身は同じ規則で辿る。
 */
export const keepNotation = (
  nodes: readonly InlineNode[],
  source: string,
  origin: Origin,
  keep: KeepInTableCell,
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

  const inside = (children: readonly InlineNode[]): readonly InlineNode[] =>
    mergeTexts(children.flatMap(demote))

  /** 装飾の記号だけを文字に戻し、中身は辿る。中身が空なら丸ごと文字にする。 */
  const unwrap = (node: Decoration): readonly InlineNode[] =>
    pipe(
      Option.all([
        Option.fromNullable(node.children[0]),
        Option.fromNullable(node.children[node.children.length - 1]),
      ]),
      Option.match({
        onNone: () => literal(node.position.start.offset, node.position.end.offset),
        onSome: ([first, last]) => [
          ...literal(node.position.start.offset, first.position.start.offset),
          ...node.children.flatMap(demote),
          ...literal(last.position.end.offset, node.position.end.offset),
        ],
      }),
    )

  const demote = (node: InlineNode): readonly InlineNode[] =>
    Match.value(node).pipe(
      Match.when({ type: 'text' }, (text) => [text]),
      Match.when({ type: 'decoration' }, (decoration) =>
        keep(decoration)
          ? [{ ...decoration, children: inside(decoration.children) }]
          : unwrap(decoration),
      ),
      Match.when(keep, (kept) => [kept]),
      Match.orElse((other) => literal(other.position.start.offset, other.position.end.offset)),
    )

  return inside(nodes)
}
