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
import { Match, Option, pipe } from 'effect'
import { type ComponentAttribute, closingTagOf, componentTagOf } from './components'

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

interface Span {
  readonly start: number
  readonly end: number
}

interface OpeningTag extends Span {
  readonly name: string
  readonly attributes: readonly ComponentAttribute[]
}

/** 行の中で見つけたタグ。`start` / `end` はパースに渡した文字列の中の位置。 */
type Tag =
  | ({ readonly _tag: 'open' } & OpeningTag)
  | ({ readonly _tag: 'self' } & OpeningTag)
  | ({ readonly _tag: 'close'; readonly name: string } & Span)

/**
 * `text[start]` の `<` から始まるタグの終わりを探す。引用符と `{}` の中の `>` は数えない。
 * 見つからなければ None。
 */
const endOfTag = (text: string, start: number): Option.Option<number> => {
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
    else if (char === '>') return Option.some(i + 1)
    else if (char === '<') return Option.none()
  }
  return Option.none()
}

/** `text[start]` の `<` から始まるタグを読む。`offset` は `text` の先頭の、ページ上の位置。 */
const readTag = (text: string, start: number, offset: number): Option.Option<Tag> => {
  if (!/^<\/?[A-Z]/.test(text.slice(start, start + 3))) return Option.none()
  return pipe(
    endOfTag(text, start),
    Option.flatMap((end) => {
      const raw = text.slice(start, end)
      const span = { start: offset + start, end: offset + end }
      return Option.match(closingTagOf(raw), {
        onSome: (name): Option.Option<Tag> => Option.some({ _tag: 'close', name, ...span }),
        onNone: () =>
          Option.map(componentTagOf(raw), (tag): Tag => {
            const opening = { name: tag.name, attributes: tag.attributes, ...span }
            return tag.selfClosing ? { _tag: 'self', ...opening } : { _tag: 'open', ...opening }
          }),
      })
    }),
  )
}

/**
 * タグを探さない範囲。記法として解釈されたノードの範囲で、素のテキストと、
 * 角括弧で囲まない裸の URL だけは探す。属性に URL を書いたタグを読めるようにするため。
 */
const isSearchable = (node: InlineNode, source: string): boolean =>
  node.type === 'text' ||
  (node.type === 'externalLink' && source[node.position.start.offset] !== '[')

/** `source` の `[start, end)` からタグを拾う。`blocked` の範囲は読み飛ばす。 */
const scanTags = (
  source: string,
  start: number,
  end: number,
  blocked: readonly (readonly [number, number])[],
): readonly Tag[] => {
  const region = source.slice(start, end)
  const tags: Tag[] = []
  let i = 0
  while (i < region.length) {
    const at = start + i
    const range = blocked.find(([from, to]) => at >= from && at < to)
    if (range !== undefined) {
      i = range[1] - start
      continue
    }
    const tag = region[i] === '<' ? readTag(region, i, start) : Option.none()
    if (Option.isNone(tag)) {
      i++
      continue
    }
    tags.push(tag.value)
    i = tag.value.end - start
  }
  return tags
}

/** 開いている途中のコンポーネント。 */
interface Frame {
  readonly tag: OpeningTag
  readonly children: readonly InlinePart[]
}

/** タグを対応させている途中の状態。`stack` の末尾が一番内側の開いているタグ。 */
interface Pairing {
  readonly root: readonly InlinePart[]
  readonly stack: readonly Frame[]
  /** 次に読むタグの前の文字列の先頭 */
  readonly cursor: number
  readonly warnings: readonly string[]
}

const innermost = (state: Pairing): Option.Option<Frame> =>
  Option.fromNullable(state.stack[state.stack.length - 1])

/** 今開いているところ (無ければ行の直下) の末尾に足す。 */
const append = (state: Pairing, parts: readonly InlinePart[]): Pairing =>
  Option.match(innermost(state), {
    onNone: () => ({ ...state, root: [...state.root, ...parts] }),
    onSome: (frame) => ({
      ...state,
      stack: [...state.stack.slice(0, -1), { ...frame, children: [...frame.children, ...parts] }],
    }),
  })

const pop = (state: Pairing): Pairing => ({ ...state, stack: state.stack.slice(0, -1) })

const warn = (state: Pairing, message: string): Pairing => ({
  ...state,
  warnings: [...state.warnings, message],
})

interface InlineComponentsResult {
  readonly parts: readonly InlinePart[]
  readonly warnings: readonly string[]
}

/** `findInlineComponents` の、Option を返し、警告を値で返す版。 */
export const inlineComponentsOf = (
  line: LineBlock,
  source: string,
  options: Omit<FindInlineComponentsOptions, 'onWarning'> = {},
): Option.Option<InlineComponentsResult> => {
  const first = line.children[0]
  const last = line.children[line.children.length - 1]
  if (first === undefined || last === undefined) return Option.none()

  const regionStart = first.position.start.offset
  const regionEnd = last.position.end.offset
  const tags = scanTags(
    source,
    regionStart,
    regionEnd,
    line.children
      .filter((node) => !isSearchable(node, source))
      .map((node) => [node.position.start.offset, node.position.end.offset] as const),
  )
  if (tags.length === 0) return Option.none()

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
  const rawOf = (tag: Span): string => source.slice(tag.start, tag.end)

  const lineNumber = line.position.start.line + 1 + (options.lineOffset ?? 0)
  const at = (message: string): string => `${message}: ${lineNumber} 行目`

  const step = (before: Pairing, tag: Tag): Pairing => {
    const state = { ...append(before, tokenize(before.cursor, tag.start)), cursor: tag.end }
    return Match.value(tag).pipe(
      Match.tag('self', (self) =>
        append(state, [
          {
            type: 'inlineComponent',
            name: self.name,
            attributes: self.attributes,
            open: rawOf(self),
            close: null,
            children: [],
          },
        ]),
      ),
      Match.tag('open', (open) => ({
        ...state,
        stack: [...state.stack, { tag: open, children: [] }],
      })),
      Match.tag('close', (close) =>
        Option.match(
          Option.filter(innermost(state), (frame) => frame.tag.name === close.name),
          {
            // 閉じる相手が無い閉じタグは、文章中の `</...>` とみなしてテキストのまま出す。
            onNone: () =>
              append(
                warn(
                  state,
                  at(`${rawOf(close)} に対応する開始タグが同じ行に無いので、テキストとして出した`),
                ),
                [textOf(close.start, close.end)],
              ),
            onSome: (frame) =>
              append(pop(state), [
                {
                  type: 'inlineComponent',
                  name: close.name,
                  attributes: frame.tag.attributes,
                  open: rawOf(frame.tag),
                  close: rawOf(close),
                  children: frame.children,
                },
              ]),
          },
        ),
      ),
      Match.exhaustive,
    )
  }

  // 閉じていない開始タグは、文章中の `Array<T>` のようなものとみなしてテキストに戻す。
  // 行ごとエラーにすると、コードの説明を書いた Cosense のページを取り込めなくなるため。
  const unwind = (state: Pairing): Pairing =>
    Option.match(innermost(state), {
      onNone: () => state,
      onSome: (frame) =>
        unwind(
          append(
            warn(
              pop(state),
              at(`${rawOf(frame.tag)} が同じ行の中で閉じられていないので、テキストとして出した`),
            ),
            [textOf(frame.tag.start, frame.tag.end), ...frame.children],
          ),
        ),
    })

  const paired = tags.reduce(step, { root: [], stack: [], cursor: regionStart, warnings: [] })
  const done = unwind(append(paired, tokenize(paired.cursor, regionEnd)))
  return Option.some({ parts: done.root, warnings: done.warnings })
}

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
): readonly InlinePart[] | null =>
  pipe(
    inlineComponentsOf(line, source, options),
    Option.map(({ parts, warnings }) => {
      for (const warning of warnings) options.onWarning?.(warning)
      return parts
    }),
    Option.getOrNull,
  )
