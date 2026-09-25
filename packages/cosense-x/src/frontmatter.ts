/**
 * frontmatter.ts — ページの属性 (投稿日・slug・draft など) を読む。
 *
 * 書ける場所は 2 つある。ファイル先頭の YAML は普通の SSG と同じ書き方で、
 * `code:frontmatter.yml` ブロックは Cosense の編集画面だけで書ける。
 */
import type { CodeBlock, Page, TopLevelBlock } from "@cosense-toolbox/parser"
import { Either, Option, pipe } from "effect"
import { parse as parseYaml } from "yaml"

import { type CosenseXError, frontmatterError, orThrow } from "./errors"

export type Frontmatter = Readonly<Record<string, unknown>>

export interface SplitFrontmatterResult {
  readonly data: Frontmatter
  /** 先頭の YAML を `---` ごと取り除いた本文 */
  readonly body: string
}

const FRONTMATTER_FILENAMES = new Set(["frontmatter.yml", "frontmatter.yaml"])

const HEAD_RE = /^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m

const toRecord = (yamlText: string, where: string): Either.Either<Frontmatter, CosenseXError> =>
  pipe(
    Either.try({
      try: (): unknown => parseYaml(yamlText),
      catch: (cause) => frontmatterError(`${where} の frontmatter を YAML として読めない`, cause),
    }),
    Either.flatMap((value) =>
      value === null || value === undefined
        ? Either.right({})
        : typeof value !== "object" || Array.isArray(value)
          ? Either.left(frontmatterError(`${where} の frontmatter はキーと値の組で書く`))
          : Either.right(value as Frontmatter),
    ),
  )

/** ファイル先頭の YAML。m フラグの ^ は途中の行頭にも当たるので、ファイル先頭から始まるものだけを採る。 */
const headOf = (source: string): Option.Option<RegExpExecArray> =>
  pipe(
    Option.fromNullable(HEAD_RE.exec(source)),
    Option.filter((match) => match.index === 0),
  )

/** `splitFrontmatter` の、失敗を Either で返す版。 */
export const splitFrontmatterEither = (
  source: string,
): Either.Either<SplitFrontmatterResult, CosenseXError> =>
  Option.match(headOf(source), {
    onNone: () => Either.right({ data: {}, body: source }),
    onSome: (match) =>
      Either.map(toRecord(match[1] ?? "", "ファイル先頭"), (data) => ({
        data,
        body: source.slice(match[0].length),
      })),
  })

/**
 * ファイル先頭の `---` で囲んだ YAML を切り離す。
 *
 * Cosense では 1 行目がタイトルなので、YAML を残したままパースすると `---` がタイトルになる。
 * そのためパースの前に取り除く。YAML として読めなければ例外を投げる。
 */
export const splitFrontmatter = (source: string): SplitFrontmatterResult =>
  orThrow(splitFrontmatterEither(source))

const isFrontmatterBlock = (block: TopLevelBlock): block is CodeBlock =>
  // インデントされたブロックは本文の一部 (コード例など) として書かれたものとみなす。
  block.type === "codeBlock" && block.indent === 0 && FRONTMATTER_FILENAMES.has(block.filename)

export interface ReadFrontmatterResult {
  readonly data: Frontmatter
  /** `code:frontmatter.yml` ブロックを取り除いたページ。ブロックが無ければ元のページそのもの */
  readonly page: Page
}

/** `readFrontmatter` の、失敗を Either で返す版。 */
export const readFrontmatterEither = (
  page: Page,
  head: Frontmatter,
): Either.Either<ReadFrontmatterResult, CosenseXError> =>
  Option.match(Option.fromNullable(page.children.find(isFrontmatterBlock)), {
    onNone: () => Either.right({ data: head, page }),
    onSome: (block) =>
      Either.map(
        toRecord(block.lines.map((line) => line.value).join("\n"), `code:${block.filename}`),
        (fromBlock) => ({
          data: { ...fromBlock, ...head },
          page: { ...page, children: page.children.filter((child) => child !== block) },
        }),
      ),
  })

/**
 * `code:frontmatter.yml` ブロックを読み、ファイル先頭の YAML (`head`) とまとめる。
 * 両方にあるキーは `head` を優先する。ファイルに書いた値で Cosense 側の値を上書きできるようにするため。
 * YAML として読めなければ例外を投げる。
 */
export const readFrontmatter = (page: Page, head: Frontmatter): ReadFrontmatterResult =>
  orThrow(readFrontmatterEither(page, head))
