/**
 * API の設定の型と、`origin` の読み方。effect の型を使うモジュール (api.ts) とは分けておく。メインの入口がこれを
 * api.ts から読むと、ビルドで 2 つの入口が型の宣言を共有し、メインの入口にも effect の型が出るため。
 */

export const DEFAULT_ORIGIN = "https://scrapbox.io"

// パスやクエリ、ユーザー名が付いていると、href は origin に `/` を足しただけの形にならない。
const isHttpOrigin = (url: URL): boolean =>
  (url.protocol === "http:" || url.protocol === "https:") && url.href === `${url.origin}/`

/**
 * `origin` の値を、パスを後ろにつなげる形 (`https://scrapbox.io`) にする。後ろの `/` は除く。
 *
 * @throws TypeError - http(s) の origin でないとき。パスやクエリが付いているときも
 */
export const originOf = (origin: string = DEFAULT_ORIGIN): string => {
  const url = URL.canParse(origin) ? new URL(origin) : undefined
  if (url === undefined || !isHttpOrigin(url)) {
    throw new TypeError(
      `origin must be an http(s) origin such as "https://scrapbox.io", without a path: ${origin}`,
    )
  }
  return url.origin
}

export interface CosenseApiConfig {
  /**
   * API の origin。後ろの `/` は付けても付けなくてもよい。http(s) の origin でなければ
   * (パスが付いているときも)、渡したときに `TypeError` を投げる。
   *
   * @defaultValue `https://scrapbox.io`
   */
  readonly origin?: string
  /** Cosense の Personal Access Token。非公開プロジェクトを読むときに渡す。`origin` 以外には送らない */
  readonly pat?: string
}

export interface CosenseApiOptions extends CosenseApiConfig {
  /** 要求を送る fetch。テストや、キャッシュを挟みたいときに渡す。 @defaultValue 呼んだときの `globalThis.fetch` */
  readonly fetch?: typeof globalThis.fetch
}

export interface ListPagesOptions {
  readonly skip?: number
  readonly limit?: number
  /** `"updated"` や `"views"` など、Cosense Web の一覧の並び順 */
  readonly sort?: string
  /** Cosense Web の一覧で保存した絞り込み (`"icon"` とユーザー名など)。両方そろったときだけ効く */
  readonly filterType?: string
  readonly filterValue?: string
}

export interface ExportForAiOptions {
  /** ページから何 hop 先のリンクまで入れるか。 @defaultValue `1` */
  readonly hop?: 1 | 2
  /** 関連ページの欄と同じように、リンク先を絞る言葉。前後の空白は除き、空なら絞らない */
  readonly search?: string
}

export interface UpdatePageOptions {
  /**
   * 読んでから書くまでに、ほかの人が同じ行を書き換えていたとき (コンフリクト) にどうするか。
   * 違う行の書き換えは、どちらでも合わせて書く。
   *
   * - `"error"`: 何も書かずに `PageConflictError` で止める
   * - `"overwrite"`: 自分の文で上書きする。自分が消した行は、ほかの人が書き換えていても消す
   *
   * @defaultValue `"error"`
   */
  readonly whenConflict?: "error" | "overwrite"
}
