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
 * 対応が取れなければ -1。
 */
const endOfBraces = (text: string, start: number): number => {
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
      if (depth === 0) return i + 1
    }
  }
  return -1
}

type ParsedValue = { readonly value: ComponentAttributeValue; readonly length: number }

/** 属性値ひとつ。書式が不正なら null (その行はコンポーネントとして扱わない)。 */
const parseAttributeValue = (text: string): ParsedValue | null => {
  const quote = text[0]
  // JSX の文字列リテラルと同じく、引用符の中でエスケープは解釈しない。
  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1)
    return end === -1 ? null : { value: text.slice(1, end), length: end + 1 }
  }
  if (quote === '{') {
    const end = endOfBraces(text, 0)
    if (end === -1) return null
    // 任意の JS 式は評価しない。共有プロジェクトのページをビルド時に実行させないため。
    try {
      return { value: JSON.parse(text.slice(1, end - 1)), length: end }
    } catch {
      return null
    }
  }
  return null
}

/**
 * 行の中身 (インデントを除いたもの) がコンポーネントの開始タグなら、その名前と属性を返す。
 * 少しでも書式から外れていれば null を返し、その行はただのテキストのままにする。
 */
export const parseComponentTag = (text: string): ComponentTag | null => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return null
  const name = NAME_RE.exec(trimmed.slice(1))?.[0]
  if (name === undefined) return null

  const selfClosing = trimmed.endsWith('/>')
  let rest = trimmed.slice(1 + name.length, trimmed.length - (selfClosing ? 2 : 1))
  const attributes: ComponentAttribute[] = []

  for (;;) {
    const withoutSpace = rest.trimStart()
    if (withoutSpace === '') break
    // 名前と属性、属性どうしは空白で区切る。
    if (withoutSpace.length === rest.length) return null
    rest = withoutSpace

    const attributeName = ATTRIBUTE_NAME_RE.exec(rest)?.[0]
    if (attributeName === undefined) return null
    rest = rest.slice(attributeName.length)

    if (!rest.startsWith('=')) {
      attributes.push({ name: attributeName, value: true })
      continue
    }
    const parsed = parseAttributeValue(rest.slice(1))
    if (parsed === null) return null
    attributes.push({ name: attributeName, value: parsed.value })
    rest = rest.slice(1 + parsed.length)
  }

  return { name, attributes, selfClosing }
}

/** 行の中身が閉じタグ (`</Name>`) なら、その名前を返す。 */
export const parseClosingTag = (text: string): string | null =>
  CLOSING_TAG_RE.exec(text.trim())?.[1] ?? null

/**
 * 中のブロックを、コンポーネントの中での深さに揃える。開始タグの行が字下げされていれば、
 * そのぶん浅くする。それより浅い行は 0 に揃える。
 */
const dedent = <T extends TopLevelBlock>(block: T, amount: number): T =>
  block.type === 'title' || amount === 0
    ? block
    : { ...block, indent: Math.max(0, block.indent - amount) }

/** 行の生テキスト。インデントも含めて位置情報から切り出す。 */
const rawTextOfLine = (source: string, line: LineBlock): string =>
  source.slice(line.position.start.offset, line.position.end.offset)

/** 開いている途中のコンポーネント。 */
interface Frame {
  readonly tag: ComponentTag
  readonly line: LineBlock
  readonly children: GroupedBlock[]
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
): GroupedBlock[] => {
  // 位置情報は 0 始まりなので 1 を足す。
  const lineNumberOf = (line: LineBlock): number => line.position.start.line + 1 + lineOffset
  const out: GroupedBlock[] = []
  const stack: Frame[] = []
  const current = (): GroupedBlock[] => stack[stack.length - 1]?.children ?? out
  /** 一番内側の開始タグの行の深さ。中の行はこのぶん浅くする */
  const base = (): number => stack[stack.length - 1]?.line.indent ?? 0

  for (const block of blocks) {
    const raw =
      block.type === 'line' && !block.quote && !block.monospace
        ? rawTextOfLine(source, block)
        : null
    if (raw === null || block.type !== 'line') {
      current().push(dedent(block, base()))
      continue
    }

    const closing = parseClosingTag(raw)
    if (closing !== null) {
      const frame = stack.pop()
      if (frame === undefined || frame.tag.name !== closing) {
        const expected = frame === undefined ? '' : ` (<${frame.tag.name}> を閉じる前に閉じている)`
        throw new Error(
          `</${closing}> に対応する開始タグが無い: ${lineNumberOf(block)} 行目${expected}`,
        )
      }
      current().push({
        type: 'component',
        ...frame.tag,
        line: dedent(frame.line, base()),
        closeLine: dedent(block, base()),
        children: frame.children,
      })
      continue
    }

    const tag = parseComponentTag(raw)
    if (tag === null) {
      current().push(dedent(block, base()))
    } else if (tag.selfClosing) {
      current().push({
        type: 'component',
        ...tag,
        line: dedent(block, base()),
        closeLine: null,
        children: [],
      })
    } else {
      stack.push({ tag, line: block, children: [] })
    }
  }

  const unclosed = stack[stack.length - 1]
  if (unclosed !== undefined) {
    throw new Error(
      `<${unclosed.tag.name}> が閉じられていない: ${lineNumberOf(unclosed.line)} 行目。</${unclosed.tag.name}> の行で閉じる`,
    )
  }
  return out
}
