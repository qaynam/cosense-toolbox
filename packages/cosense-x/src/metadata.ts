/**
 * metadata.ts — ページから一覧や `<head>` に使う情報を集める。
 * frontmatter に同じ項目があれば、そちらを使う。
 */
import { type InlineNode, type LineBlock, type Page, asImageSrc } from '@cosense-toolbox/parser'
import { toPlainText } from '@cosense-toolbox/parser/compile'
import { firstImage, visit } from '@cosense-toolbox/parser/utils'
import { parseComponentTag } from './components'
import type { Frontmatter } from './frontmatter'
import { isRelativePath, normalizeTitle, titleToSlug } from './title'

export interface PageMetadata {
  /** frontmatter の `title`、なければ 1 行目 */
  readonly title: string
  /** frontmatter の `slug`、なければタイトルから作る */
  readonly slug: string
  /** frontmatter の `description`、なければ本文の冒頭 */
  readonly description: string
  /** frontmatter の `image`、なければ本文で最初の画像 */
  readonly image: string | null
  /** 本文の `[title]` の行き先。出現順・重複なし。相対パスのリンクは書かれたまま入る */
  readonly links: readonly string[]
  /** 本文の `#tag` と frontmatter の `tags`。出現順・重複なし */
  readonly tags: readonly string[]
  /** frontmatter の `draft` が true */
  readonly draft: boolean
}

const DESCRIPTION_MIN = 120
const DESCRIPTION_MAX = 160

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : []

/** 大文字小文字や空白と `_` の違いだけの重複は、最初に出てきた書き方を残す。 */
const uniqueTitles = (titles: readonly string[]): string[] => {
  const seen = new Set<string>()
  return titles.filter((title) => {
    const key = normalizeTitle(title)
    if (key === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface CollectMetadataOptions {
  /**
   * `.csnx` のとき、パースに渡した文字列。コンポーネントの行を説明文から外すのに使う。
   */
  readonly componentsSource?: string
  /**
   * 相対パスのリンク (`[./foo.csn]`) の行き先のタイトル。本文と同じく、説明文にも
   * パスではなくタイトルを出すのに使う。undefined なら書かれたままのテキストにする。
   */
  readonly resolveRelativeLink?: (target: string) => string | undefined
}

/** 相対パスのリンクの表示を、リンク先のタイトルに置き換える。装飾の中も辿る。 */
const relabel = (
  nodes: readonly InlineNode[],
  resolve: (target: string) => string | undefined,
): InlineNode[] =>
  nodes.map((node) => {
    if (node.type === 'decoration') return { ...node, children: relabel(node.children, resolve) }
    if (node.type !== 'internalLink' || !isRelativePath(node.target)) return node
    const title = resolve(node.target)
    return title === undefined ? node : { ...node, label: title }
  })

/** 本文の冒頭から説明文を作る。検索結果やカードの抜粋に収まる長さで切る。 */
const describe = (page: Page, options: CollectMetadataOptions): string => {
  const source = options.componentsSource
  const isComponentLine = (line: LineBlock): boolean =>
    source !== undefined &&
    parseComponentTag(source.slice(line.position.start.offset, line.position.end.offset)) !== null

  const parts: string[] = []
  let length = 0
  for (const block of page.children) {
    if (length >= DESCRIPTION_MIN) break
    if (block.type !== 'line' || isComponentLine(block)) continue
    const resolve = options.resolveRelativeLink
    const line =
      resolve === undefined ? block : { ...block, children: relabel(block.children, resolve) }
    const text = toPlainText(line).trim()
    if (text === '') continue
    parts.push(text)
    length += text.length
  }
  const joined = parts.join(' ')
  return joined.length > DESCRIPTION_MAX ? `${joined.slice(0, DESCRIPTION_MAX - 1)}…` : joined
}

export const collectMetadata = (
  page: Page,
  frontmatter: Frontmatter,
  options: CollectMetadataOptions = {},
): PageMetadata => {
  const titleBlock = page.children.find((block) => block.type === 'title')
  const title = stringOf(frontmatter.title) ?? titleBlock?.value ?? ''

  const links: string[] = []
  const tags: string[] = [...stringsOf(frontmatter.tags)]
  visit(page, (node) => {
    if (node.type === 'internalLink') links.push(node.target)
    else if (node.type === 'hashtag') tags.push(node.value)
  })

  const image = firstImage(page)

  return {
    title,
    slug: stringOf(frontmatter.slug) ?? titleToSlug(title),
    description: stringOf(frontmatter.description) ?? describe(page, options),
    image:
      stringOf(frontmatter.image) ?? (image === null ? null : (asImageSrc(image.src) ?? image.src)),
    links: uniqueTitles(links),
    tags: uniqueTitles(tags),
    draft: frontmatter.draft === true,
  }
}
