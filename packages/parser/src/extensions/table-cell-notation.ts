import type { Extension } from "../inline/types"
import type { InlineNode } from "../types"

/**
 * テーブルのセルの中でも、行と同じく記法を読む拡張。Cosense Web には無い振る舞い。
 *
 * 既定ではセルの中はリンクの記法だけを読み、それ以外は書いたままの文字になる (Cosense Web と同じ)。
 * `types` を渡すと、リンクに加えてその型のノードだけを読む。省くとすべての記法 (拡張の記法も含む) を読む。
 *
 * @example
 * parse(source, { extensions: [tableCellNotation()] })              // すべての記法
 * parse(source, { extensions: [tableCellNotation(['decoration'])] }) // リンクと装飾だけ
 */
export const tableCellNotation = (types?: readonly InlineNode["type"][]): Extension => ({
  keepInTableCell: types === undefined ? () => true : (node) => types.includes(node.type),
})
