/**
 * frontmatter.ts — ページの属性 (投稿日・slug・draft など) を読む。
 *
 * 書ける場所は 2 つある。ファイル先頭の YAML は普通の SSG と同じ書き方で、
 * `code:frontmatter.yml` ブロックは Cosense の編集画面だけで書ける。
 */
import type { CodeBlock, Page, TopLevelBlock } from '@cosense-toolbox/parser'
import { parse as parseYaml } from 'yaml'

export type Frontmatter = Readonly<Record<string, unknown>>

export interface SplitFrontmatterResult {
  readonly data: Frontmatter
  /** 先頭の YAML を `---` ごと取り除いた本文 */
  readonly body: string
}

const FRONTMATTER_FILENAMES = new Set(['frontmatter.yml', 'frontmatter.yaml'])

const HEAD_RE = /^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m

const toRecord = (yamlText: string, where: string): Frontmatter => {
  let value: unknown
  try {
    value = parseYaml(yamlText)
  } catch (cause) {
    throw new Error(`${where} の frontmatter を YAML として読めない`, { cause })
  }
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${where} の frontmatter はキーと値の組で書く`)
  }
  return value as Frontmatter
}

/**
 * ファイル先頭の `---` で囲んだ YAML を切り離す。
 *
 * Cosense では 1 行目がタイトルなので、YAML を残したままパースすると `---` がタイトルになる。
 * そのためパースの前に取り除く。
 */
export const splitFrontmatter = (source: string): SplitFrontmatterResult => {
  const match = HEAD_RE.exec(source)
  // m フラグの ^ は途中の行頭にも当たるので、ファイル先頭から始まるものだけを採る。
  if (match === null || match.index !== 0) return { data: {}, body: source }
  return {
    data: toRecord(match[1] ?? '', 'ファイル先頭'),
    body: source.slice(match[0].length),
  }
}

const isFrontmatterBlock = (block: TopLevelBlock): block is CodeBlock =>
  // インデントされたブロックは本文の一部 (コード例など) として書かれたものとみなす。
  block.type === 'codeBlock' && block.indent === 0 && FRONTMATTER_FILENAMES.has(block.filename)

export interface ReadFrontmatterResult {
  readonly data: Frontmatter
  /** `code:frontmatter.yml` ブロックを取り除いたページ。ブロックが無ければ元のページそのもの */
  readonly page: Page
}

/**
 * `code:frontmatter.yml` ブロックを読み、ファイル先頭の YAML (`head`) とまとめる。
 * 両方にあるキーは `head` を優先する。ファイルに書いた値で Cosense 側の値を上書きできるようにするため。
 */
export const readFrontmatter = (page: Page, head: Frontmatter): ReadFrontmatterResult => {
  const block = page.children.find(isFrontmatterBlock)
  if (block === undefined) return { data: head, page }
  const fromBlock = toRecord(
    block.lines.map((line) => line.value).join('\n'),
    `code:${block.filename}`,
  )
  return {
    data: { ...fromBlock, ...head },
    page: { ...page, children: page.children.filter((child) => child !== block) },
  }
}
