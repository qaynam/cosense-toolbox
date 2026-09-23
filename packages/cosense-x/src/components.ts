/**
 * components.ts — `.csnx` のコンポーネント記法。
 *
 * 1 行まるごとが `<Name attr="x" />` の行をコンポーネントにする。
 * `/>` で閉じない `<Name>` の行は、それより深くインデントした後続行を children として取る。
 * Cosense ではインデントが入れ子を表すので、閉じタグを書かせない。
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
  /** `/>` で閉じていれば true。このときは後続行を children に取らない */
  readonly selfClosing: boolean
}

/** 後続行を children に取り込んだコンポーネント。 */
export interface ComponentBlock extends ComponentTag {
  readonly type: 'component'
  /** コンポーネントになった行そのもの。コンポーネントが渡されなかったときにこの行を出す */
  readonly line: LineBlock
  readonly children: readonly GroupedBlock[]
}

export type GroupedBlock = TopLevelBlock | ComponentBlock

const NAME_RE = /^[A-Z][A-Za-z0-9_]*/
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

/** ブロックの深さ。タイトルはインデントを持たない。 */
const indentOf = (block: GroupedBlock): number =>
  block.type === 'title' ? 0 : block.type === 'component' ? block.line.indent : block.indent

/** children に取り込んだブロックを、コンポーネントの中での深さに揃える。 */
const dedent = (block: TopLevelBlock, amount: number): TopLevelBlock =>
  block.type === 'title' ? block : { ...block, indent: block.indent - amount }

/** 行の生テキスト。インデントも含めて位置情報から切り出す。 */
const rawTextOfLine = (source: string, line: LineBlock): string =>
  source.slice(line.position.start.offset, line.position.end.offset)

/**
 * ページのブロック列から、コンポーネントの行とその children をまとめる。
 * `source` は位置情報の基準になった文字列 (パースに渡したもの)。
 */
export const groupComponents = (
  blocks: readonly TopLevelBlock[],
  source: string,
): GroupedBlock[] => {
  const out: GroupedBlock[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i] as TopLevelBlock
    i++
    const tag =
      block.type === 'line' && !block.quote && !block.monospace
        ? parseComponentTag(rawTextOfLine(source, block))
        : null
    if (tag === null || block.type !== 'line') {
      out.push(block)
      continue
    }

    const inner: TopLevelBlock[] = []
    if (!tag.selfClosing) {
      // 空行は深さ 0 なので、そこで children が終わる。Cosense の箇条書きと同じ区切り方。
      while (i < blocks.length && indentOf(blocks[i] as TopLevelBlock) > block.indent) {
        inner.push(dedent(blocks[i] as TopLevelBlock, block.indent + 1))
        i++
      }
    }
    out.push({
      type: 'component',
      ...tag,
      line: block,
      children: groupComponents(inner, source),
    })
  }
  return out
}
