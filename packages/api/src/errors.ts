import type { MergeConflict } from "./merge"
import type { PageDetail } from "./types"

/**
 * {@link CosenseApiError} の種類。
 *
 * - `"unauthorized"`: 401。PAT が無いか、違う
 * - `"forbidden"`: 403。プロジェクトのメンバーでないなど、権限が無い
 * - `"notFound"`: 404。ページやプロジェクトが無い。用意した書き換えの期限 (5 分) が切れたときも
 * - `"tooLarge"`: 1 回の要求の本文が大きすぎる。scrapbox.io は 100 KiB を超えると断る
 * - `"notFastForward"`: 409 `NotFastForward`。書く前に、ほかの人がページを書き換えた
 * - `"duplicateTitle"`: 409 `DuplicateTitle`。新しいページを用意してから書くまでに、同じタイトルのページができた
 * - `"invalidChanges"`: 422。もう無い行を指しているなど、変更を受け付けられない
 * - `"rateLimited"`: 429。要求が多すぎる
 * - `"serverError"`: 5xx
 * - `"network"`: 応答が来なかった (DNS や接続の失敗)
 * - `"decode"`: 2xx だが、本文を読めなかったか、形が合わなかった
 * - `"invalidUrl"`: `fetchAsset` に渡した URL かリダイレクト先が、http(s) の URL でない。渡した URL なら `status` は `0`
 * - `"unknown"`: どれでもない。`status` と `code` で見分ける
 */
export type CosenseApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "tooLarge"
  | "notFastForward"
  | "duplicateTitle"
  | "invalidChanges"
  | "rateLimited"
  | "serverError"
  | "network"
  | "decode"
  | "invalidUrl"
  | "unknown"

const KIND_BY_CODE: ReadonlyMap<string, CosenseApiErrorKind> = new Map([
  ["DecodeError", "decode"],
  ["NotFastForward", "notFastForward"],
  ["DuplicateTitle", "duplicateTitle"],
])

const KIND_BY_STATUS: ReadonlyMap<number, CosenseApiErrorKind> = new Map([
  [0, "network"],
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "notFound"],
  [413, "tooLarge"],
  [422, "invalidChanges"],
  [429, "rateLimited"],
])

const kindOf = (status: number, code: string | undefined): CosenseApiErrorKind =>
  (code === undefined ? undefined : KIND_BY_CODE.get(code)) ??
  KIND_BY_STATUS.get(status) ??
  (status >= 500 ? "serverError" : "unknown")

/**
 * Cosense の API から使える応答が返らなかった。2xx 以外の status、辿らないリダイレクト、
 * 2xx だが形の合わない本文、取りに行かない URL のどれか。何が起きたかは `kind` で見分ける。
 *
 * effect の型を使わない素の `Error` にしている。Promise の入口ではこれで reject し、effect の入口では
 * これで失敗する (`_tag` があるので `Effect.catchTag("CosenseApiError", …)` で拾える)。
 */
export class CosenseApiError extends Error {
  readonly _tag = "CosenseApiError"
  readonly kind: CosenseApiErrorKind
  /** 受け取った HTTP の status。応答が来なかった (DNS や接続の失敗) か、要求を送らなかったときは `0` */
  readonly status: number
  /**
   * 応答の本文の `error` か、それが無ければ `name` の値 (`"NotFastForward"` や `"NotLoggedInError"` など)。
   * 2xx だが本文を読めなかったときは `"DecodeError"`。どちらでもなければ無い
   */
  readonly code: string | undefined

  /**
   * @param fields - `kind` を省くと、`status` と `code` から決める。本文の文でしか分からない
   * 種類のときに渡す。
   */
  constructor(fields: {
    readonly status: number
    readonly code?: string
    readonly kind?: CosenseApiErrorKind
    readonly message: string
  }) {
    super(fields.message)
    this.name = "CosenseApiError"
    this.status = fields.status
    this.code = fields.code
    this.kind = fields.kind ?? kindOf(fields.status, fields.code)
  }
}

/**
 * `updatePage` で、読んでから書くまでにほかの人が同じ行を書き換えていた。何も書いていない。
 * `whenConflict: "error"` (既定) のときだけ起きる。
 */
export class PageConflictError extends Error {
  readonly _tag = "PageConflictError"
  /** 両方が変えた行 */
  readonly conflicts: readonly MergeConflict[]
  /** 今のページに自分の書き換えを合わせたもの。コンフリクトした行は自分の文を残している */
  readonly merged: readonly string[]
  /**
   * 合わせた先の今のページ (`commitId` と id 付きの行)。コンフリクトを自分で解いたら、
   * これを `updatePage` の `base` にして書き直す
   */
  readonly latest: PageDetail

  constructor(fields: {
    readonly conflicts: readonly MergeConflict[]
    readonly merged: readonly string[]
    readonly latest: PageDetail
  }) {
    super(`Someone else changed ${fields.conflicts.length} of the same lines`)
    this.name = "PageConflictError"
    this.conflicts = fields.conflicts
    this.merged = fields.merged
    this.latest = fields.latest
  }
}

/**
 * `createPage` で、同じタイトルのページがもうあった。何も書いていない。
 * Cosense と同じく、大文字と小文字、空白と `_` の違いは同じタイトルとして扱う。
 */
export class PageExistsError extends Error {
  readonly _tag = "PageExistsError"
  /** もうあるページ。書き足すなら、これを `updatePage` の `base` にする */
  readonly page: PageDetail

  constructor(fields: { readonly page: PageDetail }) {
    super(`A page titled "${fields.page.title}" already exists`)
    this.name = "PageExistsError"
    this.page = fields.page
  }
}
