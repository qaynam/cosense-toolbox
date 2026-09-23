/**
 * components.ts — `.csnx` のコンポーネント記法。
 *
 * 1 行まるごとが `<Name attr="x" />` の行をコンポーネントにする。
 * 中身を持たせるときは、`<Name>` の行と `</Name>` の行で挟む。間の行が children になる。
 * MDX と同じく閉じタグを必須にし、閉じ忘れと対応しない閉じタグはエラーにする。
 * インデントでは children を決めない。中の行の箇条書きを、そのまま書けるようにするため。
 *
 * パーサー本体は変更しない。Cosense の画面ではただのテキスト行に見えるほうが、
 * Cosense で書いて読む人にとって自然だから。認識はパースした後に行の生テキストで行う。
 */
import type { LineBlock, TopLevelBlock } from '@cosense-toolbox/parser'
import { Either, Match, Option, pipe } from 'effect'
import { type CosenseXError, componentTagError, orThrow } from './errors'

export type ComponentAttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly ComponentAttributeValue[]
  | { readonly [key: string]: ComponentAttributeValue }

export interface ComponentAttribute {
  readonly name: string
  /** `"..."` なら文字列、`{...}` なら JSON の値、値を書かなければ true */
  readonly value: ComponentAttributeValue
}

export interface ComponentTag {
  readonly name: string
  readonly attributes: readonly ComponentAttribute[]
  /** `/>` で閉じていれば true。このときは閉じタグを持たない */
  readonly selfClosing: boolean
}

/** 開始タグから閉じタグまでをまとめたコンポーネント。 */
export interface ComponentBlock extends ComponentTag {
  readonly type: 'component'
  /**
   * 開始タグの行と閉じタグの行 (自己完結なら null)。
   * コンポーネントが渡されなかったときは、これらの行を children と一緒にそのまま出す。
   */
  readonly line: LineBlock
  readonly closeLine: LineBlock | null
  readonly children: readonly GroupedBlock[]
}

export type GroupedBlock = TopLevelBlock | ComponentBlock

const NAME_RE = /^[A-Z][A-Za-z0-9_]*/
const CLOSING_TAG_RE = /^<\/([A-Z][A-Za-z0-9_]*)\s*>$/
const ATTRIBUTE_NAME_RE = /^[A-Za-z_][\w:.-]*/

/**
 * `{` の位置から、対応する `}` の次の位置を返す。JSON の文字列の中の括弧は数えない。
 * 対応が取れなければ None。
 */
const endOfBraces = (text: string, start: number): Option.Option<number> => {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (char === '\\') i++
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return Option.some(i + 1)
    }
  }
  return Option.none()
}

interface ParsedValue {
  readonly value: ComponentAttributeValue
  readonly length: number
}

const parseJson = (text: string): Option.Option<ComponentAttributeValue> =>
  Either.getRight(Either.try((): ComponentAttributeValue => JSON.parse(text)))

/** 属性値ひとつ。書式が不正なら None (その行はコンポーネントとして扱わない)。 */
const parseAttributeValue = (text: string): Option.Option<ParsedValue> => {
  const quote = text[0]
  // JSX の文字列リテラルと同じく、引用符の中でエスケープは解釈しない。
  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1)
    return end === -1 ? Option.none() : Option.some({ value: text.slice(1, end), length: end + 1 })
  }
  if (quote === '{') {
    // 任意の JS 式は評価しない。共有プロジェクトのページをビルド時に実行させないため。
    return pipe(
      endOfBraces(text, 0),
      Option.flatMap((end) =>
        Option.map(parseJson(text.slice(1, end - 1)), (value) => ({ value, length: end })),
      ),
    )
  }
  return Option.none()
}

/** 名前の後ろの属性の並び。名前と属性、属性どうしは空白で区切る。 */
const parseAttributes = (text: string): Option.Option<readonly ComponentAttribute[]> => {
  const rest = text.trimStart()
  if (rest === '') return Option.some([])
  if (rest.length === text.length) return Option.none()

  const followedBy = (attribute: ComponentAttribute, after: string) =>
    Option.map(parseAttributes(after), (others) => [attribute, ...others])

  return pipe(
    Option.fromNullable(ATTRIBUTE_NAME_RE.exec(rest)?.[0]),
    Option.flatMap((name) => {
      const after = rest.slice(name.length)
      if (!after.startsWith('=')) return followedBy({ name, value: true }, after)
      return pipe(
        parseAttributeValue(after.slice(1)),
        Option.flatMap(({ value, length }) => followedBy({ name, value }, after.slice(1 + length))),
      )
    }),
  )
}

/** `parseComponentTag` の、Option を返す版。 */
export const componentTagOf = (text: string): Option.Option<ComponentTag> => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return Option.none()
  const selfClosing = trimmed.endsWith('/>')
  return pipe(
    Option.fromNullable(NAME_RE.exec(trimmed.slice(1))?.[0]),
    Option.flatMap((name) =>
      Option.map(
        parseAttributes(trimmed.slice(1 + name.length, trimmed.length - (selfClosing ? 2 : 1))),
        (attributes) => ({ name, attributes, selfClosing }),
      ),
    ),
  )
}

/**
 * 行の中身 (インデントを除いたもの) がコンポーネントの開始タグなら、その名前と属性を返す。
 * 少しでも書式から外れていれば null を返し、その行はただのテキストのままにする。
 */
export const parseComponentTag = (text: string): ComponentTag | null =>
  Option.getOrNull(componentTagOf(text))

/** `parseClosingTag` の、Option を返す版。 */
export const closingTagOf = (text: string): Option.Option<string> =>
  Option.fromNullable(CLOSING_TAG_RE.exec(text.trim())?.[1])

/** 行の中身が閉じタグ (`</Name>`) なら、その名前を返す。 */
export const parseClosingTag = (text: string): string | null => Option.getOrNull(closingTagOf(text))

/**
 * 中のブロックを、コンポーネントの中での深さに揃える。開始タグの行が字下げされていれば、
 * そのぶん浅くする。それより浅い行は 0 に揃える。
 */
const dedent = <T extends TopLevelBlock>(block: T, amount: number): T =>
  block.type === 'title' || amount === 0
    ? block
    : { ...block, indent: Math.max(0, block.indent - amount) }

/** 行の生テキスト。インデントも含めて位置情報から切り出す。 */
export const rawTextOfLine = (source: string, line: LineBlock): string =>
  source.slice(line.position.start.offset, line.position.end.offset)

/** ブロックが、コンポーネントの記法の中でどの役割を持つか。 */
type BlockRole =
  | { readonly _tag: 'plain'; readonly block: TopLevelBlock }
  | { readonly _tag: 'open'; readonly line: LineBlock; readonly tag: ComponentTag }
  | { readonly _tag: 'selfClosing'; readonly line: LineBlock; readonly tag: ComponentTag }
  | { readonly _tag: 'close'; readonly line: LineBlock; readonly name: string }

const roleOf = (block: TopLevelBlock, source: string): BlockRole => {
  // 引用とコードの行に書いたタグは、タグの書き方を説明している文章とみなす。
  if (block.type !== 'line' || block.quote || block.monospace) return { _tag: 'plain', block }
  const raw = rawTextOfLine(source, block)
  return Option.match(closingTagOf(raw), {
    onSome: (name): BlockRole => ({ _tag: 'close', line: block, name }),
    onNone: () =>
      Option.match(componentTagOf(raw), {
        onNone: (): BlockRole => ({ _tag: 'plain', block }),
        onSome: (tag): BlockRole =>
          tag.selfClosing
            ? { _tag: 'selfClosing', line: block, tag }
            : { _tag: 'open', line: block, tag },
      }),
  })
}

/** 開いている途中のコンポーネント。 */
interface Frame {
  readonly tag: ComponentTag
  readonly line: LineBlock
  readonly children: readonly GroupedBlock[]
}

/** まとめている途中の状態。`stack` の末尾が一番内側の開いているコンポーネント。 */
interface Grouping {
  readonly root: readonly GroupedBlock[]
  readonly stack: readonly Frame[]
}

const innermost = (state: Grouping): Option.Option<Frame> =>
  Option.fromNullable(state.stack[state.stack.length - 1])

/** 一番内側の開始タグの行の深さ。中の行はこのぶん浅くする */
const baseIndent = (state: Grouping): number =>
  Option.match(innermost(state), { onNone: () => 0, onSome: (frame) => frame.line.indent })

/** 今開いているところ (無ければページの直下) の末尾に足す。 */
const append = (state: Grouping, block: GroupedBlock): Grouping =>
  Option.match(innermost(state), {
    onNone: () => ({ ...state, root: [...state.root, block] }),
    onSome: (frame) => ({
      ...state,
      stack: [...state.stack.slice(0, -1), { ...frame, children: [...frame.children, block] }],
    }),
  })

const componentBlock = (
  tag: ComponentTag,
  line: LineBlock,
  closeLine: LineBlock | null,
  children: readonly GroupedBlock[],
): ComponentBlock => ({ type: 'component', ...tag, line, closeLine, children })

/** `groupComponents` の、失敗を Either で返す版。 */
export const groupComponentsEither = (
  blocks: readonly TopLevelBlock[],
  source: string,
  lineOffset = 0,
): Either.Either<GroupedBlock[], CosenseXError> => {
  // 位置情報は 0 始まりなので 1 を足す。
  const lineNumberOf = (line: LineBlock): number => line.position.start.line + 1 + lineOffset

  const step = (state: Grouping, block: TopLevelBlock): Either.Either<Grouping, CosenseXError> =>
    Match.value(roleOf(block, source)).pipe(
      Match.tag('plain', ({ block }) =>
        Either.right(append(state, dedent(block, baseIndent(state)))),
      ),
      Match.tag('selfClosing', ({ line, tag }) =>
        Either.right(append(state, componentBlock(tag, dedent(line, baseIndent(state)), null, []))),
      ),
      Match.tag('open', ({ line, tag }) =>
        Either.right({ ...state, stack: [...state.stack, { tag, line, children: [] }] }),
      ),
      Match.tag('close', ({ line, name }) =>
        Option.match(
          Option.filter(innermost(state), (frame) => frame.tag.name === name),
          {
            onNone: () => {
              const expected = Option.match(innermost(state), {
                onNone: () => '',
                onSome: (frame) => ` (<${frame.tag.name}> を閉じる前に閉じている)`,
              })
              return Either.left(
                componentTagError(
                  `</${name}> に対応する開始タグが無い: ${lineNumberOf(line)} 行目${expected}`,
                ),
              )
            },
            onSome: (frame) => {
              const parent: Grouping = { ...state, stack: state.stack.slice(0, -1) }
              const base = baseIndent(parent)
              return Either.right(
                append(
                  parent,
                  componentBlock(
                    frame.tag,
                    dedent(frame.line, base),
                    dedent(line, base),
                    frame.children,
                  ),
                ),
              )
            },
          },
        ),
      ),
      Match.exhaustive,
    )

  return pipe(
    blocks.reduce<Either.Either<Grouping, CosenseXError>>(
      (state, block) => Either.flatMap(state, (grouping) => step(grouping, block)),
      Either.right({ root: [], stack: [] }),
    ),
    Either.flatMap((state) =>
      Option.match(innermost(state), {
        onNone: () => Either.right([...state.root]),
        onSome: ({ tag, line }) =>
          Either.left(
            componentTagError(
              `<${tag.name}> が閉じられていない: ${lineNumberOf(line)} 行目。</${tag.name}> の行で閉じる`,
            ),
          ),
      }),
    ),
  )
}

/**
 * ページのブロック列から、コンポーネントの行とその children をまとめる。
 * `source` は位置情報の基準になった文字列 (パースに渡したもの)。
 *
 * 閉じタグが無い、または開始タグと対応しないときは例外を投げる。
 */
export const groupComponents = (
  blocks: readonly TopLevelBlock[],
  source: string,
  /** エラーに出す行番号に足す数。ファイル先頭の YAML を取り除いたときに、その行数を渡す */
  lineOffset = 0,
): GroupedBlock[] => orThrow(groupComponentsEither(blocks, source, lineOffset))
