/**
 * frontmatter.ts — ページの属性 (投稿日・slug・draft など) を、ファイル先頭の YAML から読む。
 */
import { Either, Option, pipe } from "effect"
import { parse as parseYaml } from "yaml"

import { type CosenseXError, frontmatterError, orThrow } from "./errors"

export type Frontmatter = Readonly<Record<string, unknown>>

export interface SplitFrontmatterResult {
  readonly data: Frontmatter
  /** 先頭の YAML を `---` ごと取り除いた本文 */
  readonly body: string
}

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
