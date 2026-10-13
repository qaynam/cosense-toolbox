/**
 * API の設定の型。effect の型を使うモジュール (api.ts) とは分けておく。メインの入口がこれを
 * api.ts から読むと、ビルドで 2 つの入口が型の宣言を共有し、メインの入口にも effect の型が出るため。
 */

export const DEFAULT_ORIGIN = "https://scrapbox.io"

export interface CosenseApiConfig {
  /** API の origin。 @defaultValue `https://scrapbox.io` */
  readonly origin?: string
  /** Cosense の Personal Access Token。非公開プロジェクトを読むときに渡す。`origin` 以外には送らない */
  readonly pat?: string
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
