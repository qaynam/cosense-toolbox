/**
 * classify.ts — 1 行が何の行かを判定する。インライン記法の中身には立ち入らない。
 *
 * 結果はタグ付きユニオンなので、行の種類を増やすと分岐している側が
 * exhaustive チェックで対応漏れを教えてくれる。
 */
import { Option, pipe } from 'effect'
import { leadingWhitespace } from '../core/scan'

const CODE_HEADER_RE = /^code:(.+)$/
const TABLE_HEADER_RE = /^table:(.+)$/
/** 引用記号と、その直後の空白 1 つ (あれば本文から除く)。 */
const QUOTE_RE = /^>\s?/
const MONOSPACE_RE = /^[$%]/

export interface CodeHeaderLine {
  readonly _tag: 'codeHeader'
  readonly indent: number
  readonly filename: string
}

export interface TableHeaderLine {
  readonly _tag: 'tableHeader'
  readonly indent: number
  readonly name: string
}

export interface ContentLine {
  readonly _tag: 'content'
  readonly indent: number
  readonly quote: boolean
  readonly monospace: boolean
  /** 行の先頭から数えて、インライン記法の解析を始める位置 (インデントと引用記号の分だけ進む) */
  readonly contentOffset: number
}

export type LineRole = CodeHeaderLine | TableHeaderLine | ContentLine

const codeHeader = (rest: string, indent: number): Option.Option<LineRole> => {
  const match = rest.match(CODE_HEADER_RE)
  return match
    ? Option.some({ _tag: 'codeHeader', indent, filename: (match[1] ?? '').trimEnd() })
    : Option.none()
}

const tableHeader = (rest: string, indent: number): Option.Option<LineRole> => {
  const match = rest.match(TABLE_HEADER_RE)
  return match
    ? Option.some({ _tag: 'tableHeader', indent, name: (match[1] ?? '').trimEnd() })
    : Option.none()
}

const content = (rest: string, indent: number): LineRole => {
  const quoteMark = rest.match(QUOTE_RE)?.[0] ?? ''
  const body = rest.slice(quoteMark.length)
  return {
    _tag: 'content',
    indent,
    quote: quoteMark !== '',
    monospace: MONOSPACE_RE.test(body),
    contentOffset: indent + quoteMark.length,
  }
}

/**
 * 行の役割を判定する。`code:` / `table:` は行の意味がページの文脈
 * (コードブロックの中かどうか) で変わるので、ここでは「ヘッダの形をしている」ことだけを見る。
 */
export const classifyLine = (raw: string): LineRole => {
  const indent = leadingWhitespace(raw).length
  const rest = raw.slice(indent)
  return pipe(
    Option.firstSomeOf([codeHeader(rest, indent), tableHeader(rest, indent)]),
    Option.getOrElse(() => content(rest, indent)),
  )
}

/** 行頭の空白の文字数。全角スペースも 1 文字として数える。 */
export const indentOf = (raw: string): number => leadingWhitespace(raw).length
