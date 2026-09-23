/**
 * inline-components.ts — 行の途中に書いたコンポーネント (`.csnx`)。
 *
 * `modalを開く <Modal> [画像] </Modal>` のように、MDX のインラインの JSX と同じく
 * 行の途中の開始タグと閉じタグで挟んだ部分を children にする。
 *
 * Cosense の記法では `<` に意味が無いので、タグはパース後の行の生テキストから探す。
 * ただしリンクやコードなど、すでに記法として解釈された部分の中は探さない。
 * `` `<Modal>` `` や `[<Modal>]` をコンポーネントにしないため。
 */
import {
  type InlineNode,
  type LineBlock,
  type ParseOptions,
  type TextNode,
  tokenizeInline,
} from '@cosense-toolbox/parser'
import { type ComponentAttribute, parseClosingTag, parseComponentTag } from './components'

export interface InlineComponent {
  readonly type: 'inlineComponent'
  readonly name: string
  readonly attributes: readonly ComponentAttribute[]
  /** 開始タグの生テキスト。コンポーネントが渡されなかったときにこのまま出す */
  readonly open: string
  /** 閉じタグの生テキスト。自己完結のタグなら null */
  readonly close: string | null
  readonly children: readonly InlinePart[]
}

export type InlinePart = InlineNode | InlineComponent

export interface FindInlineComponentsOptions {
  /** パーサーに渡したオプション。タグの間の文字列を読み直すのに使う */
  readonly parseOptions?: ParseOptions
  /** 閉じていないタグなどを、テキストに戻したときに呼ぶ */
  readonly onWarning?: (message: string) => void
  /** 警告に出す行番号に足す数。ファイル先頭の YAML を取り除いたときに、その行数を渡す */
  readonly lineOffset?: number
}

type Tag =
  | { readonly kind: 'close'; readonly name: string; readonly start: number; readonly end: number }
  | {
      readonly kind: 'open' | 'self'
      readonly name: string
      readonly attributes: readonly ComponentAttribute[]
      readonly start: number
      readonly end: number
    }

/**
 * `text[start]` の `<` から始まるタグの終わりを探す。引用符と `{}` の中の `>` は数えない。
 * 見つからなければ -1。
 */
const endOfTag = (text: string, start: number): number => {
  let quote: string | null = null
  let depth = 0
  for (let i = start + 1; i < text.length; i++) {
    const char = text[i]
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (depth > 0) {
      if (char === '"') quote = char
      else if (char === '{') depth++
      else if (char === '}') depth--
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '{') depth++
    else if (char === '>') return i + 1
    else if (char === '<') return -1
  }
  return -1
}

/** `text[start]` の `<` から始まるタグを読む。タグでなければ null。 */
const readTag = (text: string, start: number, offset: number): Tag | null => {
  if (!/^<\/?[A-Z]/.test(text.slice(start, start + 3))) return null
  const end = endOfTag(text, start)
  if (end === -1) return null
  const raw = text.slice(start, end)
  const closing = parseClosingTag(raw)
  if (closing !== null) {
    return { kind: 'close', name: closing, start: offset + start, end: offset + end }
  }
  const tag = parseComponentTag(raw)
  if (tag === null) return null
  return {
    kind: tag.selfClosing ? 'self' : 'open',
    name: tag.name,
    attributes: tag.attributes,
    start: offset + start,
    end: offset + end,
  }
}

/**
 * タグを探さない範囲。記法として解釈されたノードの範囲で、素のテキストと、
 * 角括弧で囲まない裸の URL だけは探す。属性に URL を書いたタグを読めるようにするため。
 */
const isSearchable = (node: InlineNode, source: string): boolean =>
  node.type === 'text' ||
  (node.type === 'externalLink' && source[node.position.start.offset] !== '[')

/**
 * 行の中のインラインのコンポーネントをまとめる。タグが無ければ null を返し、
 * 呼び出し側は行の children をそのまま使う。
 *
 * `source` は位置情報の基準になった文字列 (パースに渡したもの)。
 */
export const findInlineComponents = (
  line: LineBlock,
  source: string,
  options: FindInlineComponentsOptions = {},
): readonly InlinePart[] | null => {
  const first = line.children[0]
  const last = line.children[line.children.length - 1]
  if (first === undefined || last === undefined) return null

  const regionStart = first.position.start.offset
  const regionEnd = last.position.end.offset
  const region = source.slice(regionStart, regionEnd)
  const blocked = line.children
    .filter((node) => !isSearchable(node, source))
    .map((node) => [node.position.start.offset, node.position.end.offset] as const)

  const tags: Tag[] = []
  let i = 0
  while (i < region.length) {
    const at = regionStart + i
    const range = blocked.find(([start, end]) => at >= start && at < end)
    if (range !== undefined) {
      i = range[1] - regionStart
      continue
    }
    const tag = region[i] === '<' ? readTag(region, i, regionStart) : null
    if (tag === null) {
      i++
      continue
    }
    tags.push(tag)
    i = tag.end - regionStart
  }
  if (tags.length === 0) return null

  const lineStart = line.position.start.offset
  const pointAt = (offset: number) => ({
    line: line.position.start.line,
    column: offset - lineStart,
    offset,
  })
  const textOf = (start: number, end: number): TextNode => ({
    type: 'text',
    value: source.slice(start, end),
    position: { start: pointAt(start), end: pointAt(end) },
  })
  // タグの間の文字列は、切り出した位置を起点に読み直す。位置情報がページ上の位置のまま保たれる。
  const tokenize = (start: number, end: number): readonly InlineNode[] =>
    start >= end
      ? []
      : tokenizeInline(source.slice(start, end), {
          origin: pointAt(start),
          ...(options.parseOptions?.extensions === undefined
            ? {}
            : { extensions: options.parseOptions.extensions }),
        })

  const lineNumber = line.position.start.line + 1 + (options.lineOffset ?? 0)
  const warn = (message: string) => options.onWarning?.(`${message}: ${lineNumber} 行目`)

  interface Frame {
    readonly tag: Tag
    readonly children: InlinePart[]
  }
  const out: InlinePart[] = []
  const stack: Frame[] = []
  const current = (): InlinePart[] => stack[stack.length - 1]?.children ?? out

  let cursor = regionStart
  for (const tag of tags) {
    current().push(...tokenize(cursor, tag.start))
    cursor = tag.end
    const raw = source.slice(tag.start, tag.end)
    if (tag.kind === 'self') {
      current().push({
        type: 'inlineComponent',
        name: tag.name,
        attributes: tag.attributes,
        open: raw,
        close: null,
        children: [],
      })
    } else if (tag.kind === 'open') {
      stack.push({ tag, children: [] })
    } else {
      const frame = stack[stack.length - 1]
      if (frame === undefined || frame.tag.name !== tag.name) {
        // 閉じる相手が無い閉じタグは、文章中の `</...>` とみなしてテキストのまま出す。
        warn(`${raw} に対応する開始タグが同じ行に無いので、テキストとして出した`)
        current().push(textOf(tag.start, tag.end))
        continue
      }
      stack.pop()
      current().push({
        type: 'inlineComponent',
        name: tag.name,
        attributes: frame.tag.kind === 'close' ? [] : frame.tag.attributes,
        open: source.slice(frame.tag.start, frame.tag.end),
        close: raw,
        children: frame.children,
      })
    }
  }
  current().push(...tokenize(cursor, regionEnd))

  // 閉じていない開始タグは、文章中の `Array<T>` のようなものとみなしてテキストに戻す。
  // 行ごとエラーにすると、コードの説明を書いた Cosense のページを取り込めなくなるため。
  while (stack.length > 0) {
    const frame = stack.pop() as Frame
    warn(
      `${source.slice(frame.tag.start, frame.tag.end)} が同じ行の中で閉じられていないので、テキストとして出した`,
    )
    current().push(textOf(frame.tag.start, frame.tag.end), ...frame.children)
  }
  return out
}
