/**
 * read.ts — ファイルの中身を、frontmatter・メタデータ・AST に分けて読む。
 *
 * コンパイルとリンクグラフの両方がここを通る。グラフだけを使う人のバンドルに
 * unified 系が入らないよう、この層は JS の生成に関わるものを import しない。
 */
import { normalizeLineEndings, type Page, parse, type ParseOptions } from "@cosense-toolbox/parser"
import { Either, Option, pipe } from "effect"

import { type CosenseXError, orThrow } from "./errors"
import { type Frontmatter, readFrontmatterEither, splitFrontmatterEither } from "./frontmatter"
import { pageByPath, type PageIndex } from "./links"
import { collectMetadata, type CollectMetadataOptions, type PageMetadata } from "./metadata"

/** `.csn` は素の Cosense 記法、`.csnx` はそれにコンポーネントの行を足したもの。 */
export type Format = "csn" | "csnx"

/** ファイル名の拡張子から形式を決める。どちらでもなければ `csn`。 */
export const formatOf = (filePath: string | undefined): Format =>
  filePath?.endsWith(".csnx") ? "csnx" : "csn"

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

/** `readPage` の、失敗を Either で返す版。 */
export const readPageEither = (
  source: string,
  options: ReadOptions = {},
): Either.Either<ReadResult, CosenseXError> => {
  const format = options.format ?? formatOf(options.filePath)
  const normalized = normalizeLineEndings(source)
  const { index, filePath } = options
  const metadataOptions = (body: string): CollectMetadataOptions => ({
    ...(format === "csnx" ? { componentsSource: body } : {}),
    ...(index === undefined || filePath === undefined
      ? {}
      : {
          resolveRelativeLink: (target: string) =>
            Option.getOrUndefined(
              Option.map(pageByPath(index, filePath, target), (page) => page.title),
            ),
        }),
  })

  return pipe(
    splitFrontmatterEither(normalized),
    Either.flatMap((head) =>
      Either.map(
        readFrontmatterEither(parse(head.body, options.parseOptions), head.data),
        ({ data, page }): ReadResult => {
          const removed = normalized.slice(0, normalized.length - head.body.length)
          return {
            format,
            frontmatter: data,
            metadata: collectMetadata(page, data, metadataOptions(head.body)),
            page,
            body: head.body,
            bodyLineOffset: removed.split("\n").length - 1,
          }
        },
      ),
    ),
  )
}

/** ファイルの中身を読む。frontmatter が YAML として読めなければ例外を投げる。 */
export const readPage = (source: string, options: ReadOptions = {}): ReadResult =>
  orThrow(readPageEither(source, options))
