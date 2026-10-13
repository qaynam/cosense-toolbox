import type { MergeConflict } from "./merge"

/**
 * Cosense の API から使える応答が返らなかった。2xx 以外の status、辿らないリダイレクト、
 * 2xx だが形の合わない本文のどれか。
 *
 * effect の型を使わない素の `Error` にしている。Promise の入口ではこれを投げ、effect の入口では
 * これで失敗する (`_tag` があるので `Effect.catchTag("CosenseApiError", …)` で拾える)。
 */
export class CosenseApiError extends Error {
  readonly _tag = "CosenseApiError"
  /** 受け取った HTTP の status。応答が来なかった (DNS や接続の失敗) ときは `0` */
  readonly status: number
  /**
   * 応答の本文 `{"error": "..."}` の値 (`"NotFastForward"` や `"DuplicateTitle"` など)。
   * 2xx だが本文を読めなかったときは `"DecodeError"`。どちらでもなければ無い
   */
  readonly code: string | undefined

  constructor(fields: {
    readonly status: number
    readonly code?: string
    readonly message: string
  }) {
    super(fields.message)
    this.name = "CosenseApiError"
    this.status = fields.status
    this.code = fields.code
  }
}

/**
 * `updatePage` で、読んでから書くまでにほかの人が同じ行を書き換えていた。何も書いていない。
 * `onConflict: "error"` (既定) のときだけ起きる。
 */
export class PageConflictError extends Error {
  readonly _tag = "PageConflictError"
  /** 両方が変えた行 */
  readonly conflicts: readonly MergeConflict[]
  /** 今のページに自分の書き換えを合わせたもの。コンフリクトした行は自分の文を残している */
  readonly merged: readonly string[]

  constructor(fields: {
    readonly conflicts: readonly MergeConflict[]
    readonly merged: readonly string[]
  }) {
    super(`Someone else changed ${fields.conflicts.length} of the same lines`)
    this.name = "PageConflictError"
    this.conflicts = fields.conflicts
    this.merged = fields.merged
  }
}
