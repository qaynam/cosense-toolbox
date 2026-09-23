/**
 * read.ts — ファイルの中身を、frontmatter・メタデータ・AST に分けて読む。
 *
 * コンパイルとリンクグラフの両方がここを通る。グラフだけを使う人のバンドルに
 * unified 系が入らないよう、この層は JS の生成に関わるものを import しない。
 */
import { type Page, type ParseOptions, normalizeLineEndings, parse } from '@cosense-toolbox/parser'
import { type Frontmatter, readFrontmatter, splitFrontmatter } from './frontmatter'
import { type PageMetadata, collectMetadata } from './metadata'

/** `.csn` は素の Cosense 記法、`.csnx` はそれにコンポーネントの行を足したもの。 */
export type Format = 'csn' | 'csnx'

/** ファイル名の拡張子から形式を決める。どちらでもなければ `csn`。 */
export const formatOf = (filePath: string | undefined): Format =>
  filePath?.endsWith('.csnx') ? 'csnx' : 'csn'

export interface ReadOptions {
  readonly format?: Format
  /** `format` を省いたとき、拡張子から形式を決めるのに使う */
  readonly filePath?: string
  /** パーサーに渡すオプション。記法の拡張 (`extensions`) を足せる */
  readonly parseOptions?: ParseOptions
}

export interface ReadResult {
  readonly format: Format
  readonly frontmatter: Frontmatter
  readonly metadata: PageMetadata
  /** `code:frontmatter.yml` ブロックを取り除いたページ */
  readonly page: Page
  /** ファイル先頭の YAML を取り除いた本文。AST の位置情報はこれが基準になる */
  readonly body: string
}

export const readPage = (source: string, options: ReadOptions = {}): ReadResult => {
  const format = options.format ?? formatOf(options.filePath)
  const head = splitFrontmatter(normalizeLineEndings(source))
  const { data, page } = readFrontmatter(parse(head.body, options.parseOptions), head.data)
  const metadata = collectMetadata(
    page,
    data,
    format === 'csnx' ? { componentsSource: head.body } : {},
  )
  return { format, frontmatter: data, metadata, page, body: head.body }
}
