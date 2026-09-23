/**
 * read.ts — ファイルの中身を、frontmatter・メタデータ・AST に分けて読む。
 *
 * コンパイルとリンクグラフの両方がここを通る。グラフだけを使う人のバンドルに
 * unified 系が入らないよう、この層は JS の生成に関わるものを import しない。
 */
import { type Page, type ParseOptions, normalizeLineEndings, parse } from '@cosense-toolbox/parser'
import { type Frontmatter, readFrontmatter, splitFrontmatter } from './frontmatter'
import type { PageIndex } from './links'
import { type CollectMetadataOptions, type PageMetadata, collectMetadata } from './metadata'
import { resolveRelativePath } from './title'

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
  /**
   * 手元のページの索引。`filePath` と一緒に渡すと、説明文の中の相対パスのリンク
   * (`[./foo.csn]`) をリンク先のタイトルにする。
   */
  readonly index?: PageIndex
}

export interface ReadResult {
  readonly format: Format
  readonly frontmatter: Frontmatter
  readonly metadata: PageMetadata
  /** `code:frontmatter.yml` ブロックを取り除いたページ */
  readonly page: Page
  /** ファイル先頭の YAML を取り除いた本文。AST の位置情報はこれが基準になる */
  readonly body: string
  /** 取り除いた先頭の YAML の行数。本文の行番号をファイルの行番号に直すのに使う */
  readonly bodyLineOffset: number
}

export const readPage = (source: string, options: ReadOptions = {}): ReadResult => {
  const format = options.format ?? formatOf(options.filePath)
  const normalized = normalizeLineEndings(source)
  const head = splitFrontmatter(normalized)
  const { data, page } = readFrontmatter(parse(head.body, options.parseOptions), head.data)
  const { index, filePath } = options
  const metadataOptions: CollectMetadataOptions = {
    ...(format === 'csnx' ? { componentsSource: head.body } : {}),
    ...(index === undefined || filePath === undefined
      ? {}
      : {
          resolveRelativeLink: (target: string) =>
            index.pages[resolveRelativePath(filePath, target)]?.title,
        }),
  }
  const metadata = collectMetadata(page, data, metadataOptions)
  const removed = normalized.length - head.body.length
  const bodyLineOffset = normalized.slice(0, removed).split('\n').length - 1
  return { format, frontmatter: data, metadata, page, body: head.body, bodyLineOffset }
}
