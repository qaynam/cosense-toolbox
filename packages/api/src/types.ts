/**
 * API の応答の型。応答はゆるく読む (schemas.ts): 知らない項目は捨て、無い項目は空の値
 * (`""` や `0`、`[]`) にする。日時はどれも Unix 時間の秒。
 */
import type { BaseLine } from "./changes"
import type { MergeConflict } from "./merge"

/** Cosense Web の一覧で保存した絞り込み。`{ type: "icon", value: "taro" }` など。 */
export interface PageFilter {
  readonly type: string
  readonly value: string
}

export interface Me {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly email?: string
  readonly photo?: string
  readonly pageFilters: readonly PageFilter[]
}

export interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly publicVisible: boolean
  readonly isMember: boolean
  readonly usersCount: number
  readonly created: number
  readonly updated: number
}

export interface ProjectDetail {
  readonly id: string
  readonly name: string
  readonly displayName: string
  /** 貼り付けた画像の送り先。`"gyazo"` か `"gcs"` */
  readonly uploadImageTo: string
  readonly uploadFileTo: string
  /** 画像を送る Gyazo Teams の名前。Teams でなければ `null` */
  readonly gyazoTeamsName: string | null
}

export interface UserRef {
  readonly id: string
  readonly name?: string
  readonly displayName?: string
}

export interface ProjectUsers {
  /** 読めなかったときは空 */
  readonly projectId: string
  /** 今のメンバーと、抜けたメンバー */
  readonly users: readonly UserRef[]
}

export interface PageSummary {
  readonly id: string
  readonly title: string
  readonly image: string | null
  readonly descriptions: readonly string[]
  readonly user?: UserRef | null
  readonly linked: number
  readonly views: number
  readonly linesCount: number
  readonly charsCount: number
  readonly created: number
  readonly updated: number
  /** 自分が最後に開いた日時。開いたことが無ければ `0`。`updated > accessed` なら未読 */
  readonly accessed: number
  /** ピン留めの並び順。`0` ならピン留めしていない */
  readonly pin: number
}

export interface PageDetailLine {
  readonly id: string
  readonly text: string
  /** 最後に書き換えた日時。応答に無ければ `0` */
  readonly updated: number
  /** 最後に書き換えた人の id。応答に無ければ `""` */
  readonly userId: string
}

/** ページの中身。まだ書かれていないページは、この形にせず無いものとして返す。 */
export interface PageDetail {
  readonly id: string
  readonly title: string
  readonly commitId: string
  readonly lines: readonly PageDetailLine[]
  readonly created: number
  readonly updated: number
  /** 自分が最後に開いた日時。開いたことが無ければ `0` */
  readonly accessed: number
  readonly views: number
  readonly linked: number
  readonly linesCount: number
  readonly charsCount: number
  /** ピン留めの並び順。`0` ならピン留めしていない */
  readonly pin: number
  readonly pageRank: number
  /** 残っている履歴の数 (Cosense Web の「ページ履歴」) */
  readonly snapshotCount: number
  /** 作った人。id しか入っていないので、名前は `projectUsers` で引く */
  readonly user?: UserRef | null
  readonly lastUpdateUser?: UserRef | null
  /** 書き換えたことのある人全員 (作った人も含む)。これも id だけ */
  readonly users?: readonly UserRef[]
}

export interface RelatedPage {
  readonly id: string
  readonly title: string
  readonly titleLc: string
  readonly image: string | null
  readonly descriptions: readonly string[]
  readonly linksLc: readonly string[]
  readonly linked: number
  readonly pageRank: number
  readonly updated: number
  readonly created: number
  /** 誰かが最後に開いた日時 */
  readonly accessed: number
  readonly relation?: "outgoing" | "incoming" | "bidirectional"
}

export interface RelatedPages {
  readonly links1hop: readonly RelatedPage[]
  /** `links1hop` にあるページは除く (Cosense Web と同じ) */
  readonly links2hop: readonly RelatedPage[]
  /** 2 hop のまとまりの見出しに出さないリンク (小文字) */
  readonly hiddenHeadwordsLc: readonly string[]
  /** 同じページを指す別名のまとまり。それぞれ、表示に使う名前が先頭 */
  readonly synonyms: readonly (readonly string[])[]
}

export interface SearchResultPage {
  readonly id: string
  readonly title: string
  readonly words: readonly string[]
  readonly lines: readonly string[]
  readonly views: number
  readonly linked: number
  readonly updated: number
}

export interface SearchResult {
  readonly count: number
  readonly existsExactTitleMatch: boolean
  readonly pages: readonly SearchResultPage[]
}

export interface VectorResultPage {
  readonly title: string
  readonly image: string | null
  readonly score: number
  readonly exists: boolean
  readonly id?: string
  readonly linked?: number
}

export interface VectorResult {
  readonly pages: readonly VectorResultPage[]
}

export interface TitleEntry {
  readonly id: string
  readonly title: string
  readonly titleLc: string
  readonly updated: number
  readonly image: string | null
  /** そのページから出ているリンク。まだ書かれていないページへのリンクも含む */
  readonly links: readonly string[]
}

export interface FetchedAsset {
  readonly data: Uint8Array
  /** `Content-Type` ヘッダの値。無ければ空文字 */
  readonly contentType: string
}

/** ページ履歴の 1 件。 */
export interface PageSnapshotEntry {
  readonly id: string
  /** この時点でページを最後に書き換えた日時 */
  readonly created: number
}

export interface SnapshotLine {
  readonly id: string
  readonly text: string
  /** 応答に無ければ `0` */
  readonly created: number
  /** 応答に無ければ `0` */
  readonly updated: number
  /** 応答に無ければ `""` */
  readonly userId: string
}

/** 履歴のある時点のページ。 */
export interface PageSnapshot {
  readonly title: string
  readonly created: number
  readonly lines: readonly SnapshotLine[]
}

// ここから下は、ページを書き換える API (`previewEdit` / `submitEdit`) に渡すものと返るもの。

export interface RawInsertChange {
  /** 前に入れる行の id。末尾に足すときは `"_end"` */
  readonly _insert: string
  readonly lines: { readonly id: string; readonly text: string }
}

export interface RawUpdateChange {
  /** 書き換える行の id */
  readonly _update: string
  readonly lines: { readonly text: string }
}

export interface RawDeleteChange {
  /** 消す行の id */
  readonly _delete: string
}

export type RawChange = RawInsertChange | RawUpdateChange | RawDeleteChange

/** ページ全体を消す。行の変更と一緒には渡さず、これだけを渡す。 */
export interface RawPageDelete {
  readonly deleted: true
}

export interface PreviewEditBody {
  /** 書き換えるページの id。無ければ新しいページを作る (1 行目がタイトル) */
  readonly pageId?: string
  readonly changes: readonly RawChange[] | readonly [RawPageDelete]
}

export interface PagePreview {
  readonly title?: string
  /**
   * preview を作ったときにページが指していたコミット。変更を作ったときのコミットではない。
   * 要求には元のコミットを書かないので、変更が古いページから作られたかは、これと手元の `commitId`
   * を比べて知るしかない。違うのに送ると、`_update` が、そのあいだにほかの人が書いた行を上書きする。
   */
  readonly commitId?: string
  readonly persistent?: boolean
  readonly lines?: readonly PageDetailLine[]
}

export interface PreviewResponse {
  readonly previewId: string
  readonly expireAt: string
  readonly pagePreview: PagePreview | null
  /** ページを消す preview として受け付けたときだけ `true` */
  readonly pageDelete?: boolean
}

export interface SubmitResponse {
  readonly commitId: string
  readonly page: { readonly title: string } | null
  readonly titleChanged?: { readonly from: string; readonly to: string }
  readonly pageDeleted?: { readonly title: string }
}

/** `updatePage` に渡す、読んだときのページ。`getPage` の結果をそのまま渡せる。 */
export interface PageToUpdate {
  readonly id: string
  /** ページを読み直すのに使う。名前を変えられていても、今のページを引く */
  readonly title: string
  readonly commitId: string
  readonly lines: readonly BaseLine[]
}

export interface UpdatePageResult {
  /** 書いた後のコミット。何も変えなかったら、読んだときのまま */
  readonly commitId: string
  /** 書いた後のページの行の文。ほかの人の書き換えを合わせたもの */
  readonly lines: readonly string[]
  /** 自分の文で上書きしたコンフリクト (`whenConflict: "overwrite"` のとき)。無ければ空 */
  readonly overwritten: readonly MergeConflict[]
}
