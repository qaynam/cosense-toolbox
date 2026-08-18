/**
 * build.ts — 行の並びをブロックに畳む。
 *
 * `code:` / `table:` は「ヘッダ行 + それより深いインデントの行」で 1 つのブロックになる。
 * この複数行のまとまりを作るのがここの仕事で、行の中身の解釈は注入された tokenize に任せる
 * (どの記法ルールを使うかを知らずに済むので、拡張入りのパーサーでもここは変わらない)。
 */
import { Match } from 'effect'
import { type Origin, originOfLine, spanAt } from '../core/position'
import type {
  CodeBlock,
  CodeLine,
  InlineNode,
  LineBlock,
  TableBlock,
  TableCell,
  TableRow,
  TitleBlock,
  TopLevelBlock,
} from '../types'
import { type ContentLine, classifyLine, indentOf } from './classify'

/** 1 行分の入力。`offset` はソース全文における行頭の位置。 */
export interface SourceLine {
  readonly index: number
  readonly text: string
  readonly offset: number
}

/**
 * 行の一部をインライン記法として解析する関数。
 * 記法ルールの構成は呼び出し側が束ねて渡すので、この層は拡張の有無を知らずに済む。
 */
export type TokenizeLine = (source: string, origin: Origin) => readonly InlineNode[]

const lineOrigin = (line: SourceLine): Origin => originOfLine(line.index, line.offset)

const wholeLine = (line: SourceLine) => spanAt(lineOrigin(line), 0, line.text.length)

/** インデントを `amount` 文字ぶん浅くする。空白より多くは削らない。 */
const dedent = (text: string, amount: number): string =>
  text.slice(Math.min(amount, indentOf(text)))

const titleBlock = (line: SourceLine, tokenize: TokenizeLine): TitleBlock => ({
  type: 'title',
  value: line.text,
  children: tokenize(line.text, lineOrigin(line)),
  position: wholeLine(line),
})

const lineBlock = (line: SourceLine, role: ContentLine, tokenize: TokenizeLine): LineBlock => ({
  type: 'line',
  indent: role.indent,
  quote: role.quote,
  monospace: role.monospace,
  children: tokenize(line.text.slice(role.contentOffset), {
    line: line.index,
    column: role.contentOffset,
    offset: line.offset + role.contentOffset,
  }),
  position: wholeLine(line),
})

const codeLine = (line: SourceLine, headerIndent: number): CodeLine => ({
  type: 'codeLine',
  // ヘッダより 1 段深いところがコードの左端。それより深いインデントは中身なので保つ。
  value: dedent(line.text, headerIndent + 1),
  position: wholeLine(line),
})

const tableCells = (line: SourceLine): readonly TableCell[] => {
  const indent = indentOf(line.text)
  const origin = lineOrigin(line)
  const cells: TableCell[] = []
  let start = indent
  for (const value of line.text.slice(indent).split('\t')) {
    cells.push({ type: 'tableCell', value, position: spanAt(origin, start, start + value.length) })
    start += value.length + 1 // タブ 1 文字ぶん進める
  }
  return cells
}

const tableRow = (line: SourceLine): TableRow => ({
  type: 'tableRow',
  cells: tableCells(line),
  position: wholeLine(line),
})

/** ヘッダより深いインデントが続く範囲の終端 (exclusive)。 */
const bodyEnd = (lines: readonly SourceLine[], start: number, headerIndent: number): number => {
  let end = start
  while (end < lines.length) {
    const line = lines[end]
    if (line === undefined || indentOf(line.text) <= headerIndent) break
    end++
  }
  return end
}

const blockPosition = (header: SourceLine, body: readonly SourceLine[]) => ({
  start: wholeLine(header).start,
  end: wholeLine(body[body.length - 1] ?? header).end,
})

const codeBlock = (
  header: SourceLine,
  body: readonly SourceLine[],
  filename: string,
  indent: number,
): CodeBlock => ({
  type: 'codeBlock',
  filename,
  indent,
  lines: body.map((line) => codeLine(line, indent)),
  position: blockPosition(header, body),
})

const tableBlock = (
  header: SourceLine,
  body: readonly SourceLine[],
  name: string,
  indent: number,
): TableBlock => ({
  type: 'table',
  name,
  indent,
  rows: body.map(tableRow),
  position: blockPosition(header, body),
})

/**
 * 行の並びをブロックの並びに畳む。1 行目は無条件でタイトルになる
 * (Cosense ではタイトル行が `code:` や `table:` として解釈されることはない)。
 */
export const buildBlocks = (
  lines: readonly SourceLine[],
  tokenize: TokenizeLine,
): readonly TopLevelBlock[] => {
  const blocks: TopLevelBlock[] = []
  const head = lines[0]
  if (head === undefined) return blocks
  blocks.push(titleBlock(head, tokenize))

  let index = 1
  while (index < lines.length) {
    const line = lines[index]
    if (line === undefined) break

    index = Match.value(classifyLine(line.text)).pipe(
      Match.tag('codeHeader', (role) => {
        const end = bodyEnd(lines, index + 1, role.indent)
        blocks.push(codeBlock(line, lines.slice(index + 1, end), role.filename, role.indent))
        return end
      }),
      Match.tag('tableHeader', (role) => {
        const end = bodyEnd(lines, index + 1, role.indent)
        blocks.push(tableBlock(line, lines.slice(index + 1, end), role.name, role.indent))
        return end
      }),
      Match.tag('content', (role) => {
        blocks.push(lineBlock(line, role, tokenize))
        return index + 1
      }),
      Match.exhaustive,
    )
  }

  return blocks
}

/**
 * 1 行だけを通常行として組み立てる。
 * ページの文脈が無いので `code:` / `table:` ヘッダもブロックにはせず、通常行として扱う。
 */
export const buildLineBlock = (line: SourceLine, tokenize: TokenizeLine): LineBlock => {
  const role = classifyLine(line.text)
  return lineBlock(
    line,
    role._tag === 'content'
      ? role
      : {
          _tag: 'content',
          indent: role.indent,
          quote: false,
          monospace: false,
          contentOffset: role.indent,
        },
    tokenize,
  )
}
