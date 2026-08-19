/**
 * parse.ts — ページ全文の入口。
 */
import { type SourceLine, buildBlocks, buildLineBlock } from './block/build'
import { resolveExtensions, tokenizeInlineWith } from './inline/tokenize'
import type { Extension } from './inline/types'
import type { LineBlock, Page } from './types'

/**
 * CR / CRLF を LF に揃える。
 *
 * `parse` は必ずこれを通してから解析するので、報告される位置は**正規化後**の
 * 文字列を基準にする。CRLF のソースでは元のオフセットと 1 行につき 1 文字ずれる。
 */
export const normalizeLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n')

export interface ParseOptions {
  /** 記法の拡張。既定のルールより先に試される */
  readonly extensions?: readonly Extension[]
}

const toSourceLines = (source: string): readonly SourceLine[] => {
  const lines: SourceLine[] = []
  let offset = 0
  for (const [index, text] of source.split('\n').entries()) {
    lines.push({ index, text, offset })
    offset += text.length + 1 // 改行 1 文字ぶん進める
  }
  return lines
}

/**
 * ページ全文をパースする。**失敗しない**: どんな入力でも Page を返す。
 * 記法として成立しない部分は素のテキストになるだけで、エラーにはならない。
 *
 * 1 行目はタイトルとして扱われる (Cosense のページは 1 行目がタイトル)。
 */
export const parse = (source: string, options?: ParseOptions): Page => {
  const normalized = normalizeLineEndings(source)
  const lines = toSourceLines(normalized)
  const rules = resolveExtensions(options?.extensions)
  const last = lines[lines.length - 1]

  return {
    type: 'page',
    children: buildBlocks(lines, (text, origin) => tokenizeInlineWith(text, origin, rules)),
    position: {
      start: { line: 0, column: 0, offset: 0 },
      end: {
        line: last?.index ?? 0,
        column: last?.text.length ?? 0,
        offset: normalized.length,
      },
    },
  }
}

export interface ParseLineOptions extends ParseOptions {
  /** この行がページ内の何行目か (既定: 0) */
  readonly line?: number
  /** この行の行頭がソース全文のどこにあるか (既定: 0) */
  readonly offset?: number
}

/**
 * 1 行だけを通常行としてパースする。
 *
 * `code:` / `table:` はページの文脈があって初めてブロックになるので、
 * ここでは通常行として扱う。
 */
export const parseLine = (raw: string, options?: ParseLineOptions): LineBlock => {
  const rules = resolveExtensions(options?.extensions)
  return buildLineBlock(
    { index: options?.line ?? 0, text: raw, offset: options?.offset ?? 0 },
    (text, origin) => tokenizeInlineWith(text, origin, rules),
  )
}

export interface Parser {
  readonly parse: (source: string) => Page
  readonly parseLine: (raw: string, options?: Omit<ParseLineOptions, 'extensions'>) => LineBlock
}

/**
 * 拡張を固定したパーサーを作る。同じ拡張で何度もパースするときに、
 * 呼び出しごとに options を渡さずに済む。
 */
export const createParser = (options?: ParseOptions): Parser => ({
  parse: (source) => parse(source, options),
  parseLine: (raw, lineOptions) => parseLine(raw, { ...lineOptions, ...options }),
})
