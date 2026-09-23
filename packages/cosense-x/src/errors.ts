/**
 * errors.ts — 失敗の値。
 *
 * 内部の関数は失敗を `Either` の Left として返し、例外を投げない。
 * 例外にするのは公開関数の境目 (`orThrow`) だけ。parser が内部で `Option` を使い、
 * 境目で `null` にしているのと同じ分け方。
 *
 * class (`Data.TaggedError`) にしないのは、parser と同じく値をただのオブジェクトに保つため。
 */
import { Either } from 'effect'

export type CosenseXError =
  /** frontmatter が YAML として読めない、またはキーと値の組になっていない */
  | { readonly _tag: 'FrontmatterError'; readonly message: string; readonly cause?: unknown }
  /** `.csnx` の開始タグと閉じタグが対応していない */
  | { readonly _tag: 'ComponentTagError'; readonly message: string }
  /** `unresolved: 'error'` のときに、リンク先のページが見つからない */
  | { readonly _tag: 'UnresolvedLinkError'; readonly message: string }

export const frontmatterError = (message: string, cause?: unknown): CosenseXError =>
  cause === undefined
    ? { _tag: 'FrontmatterError', message }
    : { _tag: 'FrontmatterError', message, cause }

export const componentTagError = (message: string): CosenseXError => ({
  _tag: 'ComponentTagError',
  message,
})

export const unresolvedLinkError = (message: string): CosenseXError => ({
  _tag: 'UnresolvedLinkError',
  message,
})

export const toError = (error: CosenseXError): Error =>
  error._tag === 'FrontmatterError' && error.cause !== undefined
    ? new Error(error.message, { cause: error.cause })
    : new Error(error.message)

/** 公開関数の境目で使う。Left なら `Error` にして投げる。 */
export const orThrow = <A>(result: Either.Either<A, CosenseXError>): A =>
  Either.getOrThrowWith(result, toError)
