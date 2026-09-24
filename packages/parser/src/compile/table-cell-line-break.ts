/**
 * table-cell-line-break.ts — テーブルのセルの中の文字列を改行にする。
 *
 * `toHtml` の `tableCellLineBreakMarker` の実装。出力の形に依らないようハンドラを包む形にしてあり、
 * 別の形式のコンパイラ (cosense-x の hast など) も同じ関数を使う。実装を 1 つにしておくことで、
 * 形式ごとに挙動がずれないようにしている。
 */
import { childrenOf } from '../ast'
import type { AnyNodeType } from '../types'
import {
  type CompileContext,
  type NodeHandler,
  type NodeHandlers,
  createCompiler,
} from './create-compiler'

export interface TableCellLineBreakOptions<Out> {
  /** 改行として扱う文字列。null / undefined / 空文字なら何もしない */
  readonly marker: string | null | undefined
  /** ハンドラの無いノードの変換。コンパイラに渡すものと同じものを渡す */
  readonly fallback: NodeHandler<Out, AnyNodeType>
  /** 区切った各部分の出力を、改行を挟んで 1 つにつなぐ。HTML 文字列なら `lines.join('<br>')` */
  readonly joinLines: (lines: readonly Out[]) => Out
}

/**
 * セルの中の text ノードを `marker` で区切り、`joinLines` でつなぐようにハンドラを包む。
 *
 * text のハンドラはセルの中か外かを知らないので、セルの中身に入ったところで
 * text の扱いだけを差し替えたコンパイラに切り替える。コードやリンクの表示の中には当たらない。
 * 区切った各部分は元の text のハンドラに通すので、エスケープや text の上書きはそのまま効く。
 * `tableCell` を上書きしたハンドラにも、切り替えたあとの文脈が渡る。
 */
export const withTableCellLineBreaks = <Out>(
  handlers: NodeHandlers<Out>,
  options: TableCellLineBreakOptions<Out>,
): NodeHandlers<Out> => {
  const { marker, fallback, joinLines } = options
  const { text, tableCell } = handlers
  if (marker === null || marker === undefined || marker === '' || text === undefined) {
    return handlers
  }
  const compileCell = createCompiler<Out>({
    handlers: {
      ...handlers,
      text: (node, ctx) =>
        joinLines(node.value.split(marker).map((value) => text({ ...node, value }, ctx))),
    },
    fallback,
  })
  const cellContext: CompileContext<Out> = {
    node: compileCell,
    children: (node) => childrenOf(node).map(compileCell),
  }
  return {
    ...handlers,
    tableCell: (node) => (tableCell ?? fallback)(node, cellContext),
  }
}
