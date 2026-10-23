/**
 * `@cosense-toolbox/api`。中は effect で書いているが、ここで渡すものは素の型にする。
 * 時間のかかるものは `Promise`、無いものは `null` で返し、失敗は `CosenseApiError` で reject する
 * (`updatePage` のコンフリクトは `PageConflictError`、`createPage` で同じタイトルのページがあれば
 * `PageExistsError`)。
 * effect の型のまま使いたい人は `@cosense-toolbox/api/effect` を使う。
 */
import { Cause, Effect, Exit, Layer, Option } from "effect"

import { createCosenseApi as createCosenseApiEffect } from "../api"
import type { CosenseApiError } from "../errors"
import { HttpClient, httpClientOf } from "../http-client"
import type {
  CosenseApiOptions,
  ExportForAiOptions,
  ListPagesOptions,
  UpdatePageOptions,
} from "../options"
import type {
  CreatePageResult,
  FetchedAsset,
  Infobox,
  LiterateDatabase,
  Me,
  PageDetail,
  PageSnapshot,
  PageSnapshotEntry,
  PageSummary,
  PageToUpdate,
  PreviewEditBody,
  PreviewResponse,
  ProjectDetail,
  ProjectSummary,
  ProjectUsers,
  RelatedPages,
  SearchResult,
  SubmitResponse,
  TitleEntry,
  UpdatePageResult,
  VectorResult,
} from "../types"

export { cosenseIconUrl, isCosenseAssetUrl } from "../assets"
export {
  alignLines,
  type BaseLine,
  buildSegments,
  type ChangedSegment,
  computeChanges,
  createLineId,
  type EditSegment,
  type KeptSegment,
} from "../changes"
export {
  CosenseApiError,
  type CosenseApiErrorKind,
  PageConflictError,
  PageExistsError,
} from "../errors"
export { type MergeConflict, type MergeResult, mergeThreeWay } from "../merge"
export type {
  CosenseApiConfig,
  CosenseApiOptions,
  ExportForAiOptions,
  ListPagesOptions,
  UpdatePageOptions,
} from "../options"
export type * from "../types"

/**
 * {@link createCosenseApi} が返すもの。プロジェクトの中のものは `project(name)` から呼ぶ。
 * 失敗は `CosenseApiError` で reject する。
 */
export interface CosenseApi {
  readonly getMe: () => Promise<Me>
  readonly listProjects: () => Promise<readonly ProjectSummary[]>
  /**
   * Cosense 上のファイル (アップロードした `/files/…` やアイコン) の中身を取ってくる。
   *
   * これらは `Cross-Origin-Resource-Policy: same-origin` を返すので別のサイトの `<img>` からは読めず、
   * リダイレクト先の URL も期限付き (`/files/` は 5 分) なので、静的なサイトには中身を置く必要がある。
   * ファイルは別の場所 (Google Cloud Storage や Gyazo) へリダイレクトされるので、5 回まで辿る。
   * PAT は `origin` への要求にだけ付け、リダイレクト先には送らない。
   * 渡した URL もリダイレクト先も、http(s) でなければ取りに行かずに `kind: "invalidUrl"` で失敗する。
   */
  readonly fetchAsset: (url: string) => Promise<FetchedAsset>
  /**
   * プロジェクト `name` の中のものを呼ぶ関数をまとめて返す。`name` はエンコードしてパスに入れる。
   *
   * @throws TypeError - `name` が空か、`.` か `..` のとき
   */
  readonly project: (name: string) => CosenseProjectApi
}

/**
 * {@link CosenseApi.project} が返すもの。どれも、そのプロジェクトの中のものを呼ぶ。失敗は
 * `CosenseApiError` で reject する (`updatePage` と `createPage` の、それぞれの説明にあるものは除く)。
 */
export interface CosenseProjectApi {
  /** `project` に渡したプロジェクトの名前 (エンコードする前)。 */
  readonly name: string
  /** プロジェクトの設定。画像やファイルの送り先を含む。 */
  readonly getProject: () => Promise<ProjectDetail>
  /** ページを書いた人として出てくる人全員。今のメンバーと、抜けたメンバー。 */
  readonly listUsers: () => Promise<ProjectUsers>
  readonly listPages: (
    options?: ListPagesOptions,
  ) => Promise<{ readonly count: number; readonly pages: readonly PageSummary[] }>
  /**
   * ページの中身。名前を変えたページは、古いタイトルでも今のページを返す。
   * 無いページと、まだ書かれていないページは `null`。
   */
  readonly getPage: (title: string) => Promise<PageDetail | null>
  /** ページの本文をテキストのまま返す。1 行目がタイトル。無いページは `null`。 */
  readonly getPageText: (title: string) => Promise<string | null>
  /**
   * 関連ページ。1 hop と 2 hop を並べて取り、それぞれ続きのページも辿る。
   *
   * 続きが無くなるまで要求する。件数では止めず、途中までを返すことはない。Cosense が示す続きの位置が
   * 前に辿ったところへ戻ったら、終わらないので `CosenseApiError` で reject する。
   */
  readonly getRelatedPages: (title: string) => Promise<RelatedPages>
  /** ページの Infobox だけを読む。`getPage` の結果にも同じものが入っている。 */
  readonly getInfobox: (pageId: string) => Promise<Infobox>
  /**
   * 定義ページの表 (文芸的データベース)。Cosense Web が定義ページの下に出す表と、同じ行と列を返す。
   * 名前を変えたページは、古いタイトルでも今のページの表を返す。ページが無いか、定義ページでなければ `null`。
   */
  readonly getLiterateDatabase: (title: string) => Promise<LiterateDatabase | null>
  /**
   * Cosense の「AI 用にエクスポート」(Smart Context)。ページと、`hop` 以内のリンク先を 1 つの
   * テキストにする。
   */
  readonly exportForAi: (title: string, options?: ExportForAiOptions) => Promise<string>
  /** 本文を全文検索する。pageRank の順に 100 件まで。 */
  readonly searchFullText: (query: string) => Promise<SearchResult>
  /** タイトルのベクトル検索。使えないプロジェクトでは、失敗にせず空の結果を返す。 */
  readonly searchVector: (query: string) => Promise<VectorResult>
  /**
   * プロジェクトのすべてのページのタイトルと、そこから出ているリンク。
   *
   * 1 回に 1 万件ずつ、続きが無くなるまで要求する。途中までを返すことはない。Cosense が示す続きの位置が
   * 前に辿ったところへ戻ったら、終わらないので `CosenseApiError` で失敗する。
   */
  readonly listTitles: () => Promise<readonly TitleEntry[]>
  /** ページの履歴。新しい順で、Cosense が返す最新の 100 件まで。 */
  readonly listSnapshots: (pageId: string) => Promise<readonly PageSnapshotEntry[]>
  readonly getSnapshot: (pageId: string, snapshotId: string) => Promise<PageSnapshot>
  /**
   * ページの書き換えを用意する。まだ書き換えない。`pagePreview.commitId` が手元の `commitId` と
   * 違えば、そのあいだにほかの人が書き換えている (そのまま送ると、その人の行を上書きする)。
   */
  readonly previewEdit: (body: PreviewEditBody) => Promise<PreviewResponse>
  /** 用意した書き換え (`previewId`) をページに書く。 */
  readonly submitEdit: (previewId: string) => Promise<SubmitResponse>
  /**
   * プロジェクトの中の `[from]` と `#from`、`[from.icon]` を、すべて `to` を指すように書き換える。
   * ページ自体のタイトルは変えない。大文字と小文字、空白と `_` の違いは区別しない。別のプロジェクトへの
   * リンク (`[/p/from]`) は書き換えない。500 が返ったら書き換え残しがあるが、同じ呼び出しをやり直してよい。
   */
  readonly replaceLinks: (from: string, to: string) => Promise<{ readonly message: string }>
  /** ページを開いたことを記録する (未読でなくなる)。記録できなくても reject しない。 */
  readonly markAccessed: (pageId: string) => Promise<void>
  /**
   * このページで、定義ページ `definitionTitle` の項目を抜き出すのを止める (Cosense Web の
   * 「disable extraction」)。定義ページへのリンクはそのままで、定義ページの表 (文芸的データベース) から
   * このページが外れる。止めた後の、このページの Infobox を返す。
   */
  readonly disableInfoboxExtraction: (pageId: string, definitionTitle: string) => Promise<Infobox>
  /**
   * 止めた抜き出しを戻す。戻した後の、このページの Infobox を返す。Cosense Web は、戻した後に
   * `requestInfoboxExtraction` で抜き出し直す。
   */
  readonly enableInfoboxExtraction: (pageId: string, definitionTitle: string) => Promise<Infobox>
  /**
   * このページの本文から Infobox を抜き出し直すよう、Cosense に頼む。抜き出した値は `getInfobox` で読む。
   *
   * Cosense Web は、定義ページの表を書き換えると、関連ページ (1 hop) のそれぞれにこれを頼む。
   * `updatePage` で定義ページの表を書き換えたときは、要るなら自分で頼む。
   */
  readonly requestInfoboxExtraction: (pageId: string) => Promise<void>
  /**
   * 読んだときのページ (`base`) を、`lines` の文にする。行の差分を作り、用意して書くまでをまとめて行う。
   *
   * 読んでから書くまでにほかの人が書き換えていたら、今のページを読み直して 3-way merge する。
   * 違う行の書き換えは合わせて書き、同じ行の書き換え (コンフリクト) は `whenConflict` に従う。
   * 既定では何も書かずに `PageConflictError` で reject する。書き換えが続いたら、3 回試して諦める
   * (`CosenseApiError`、`kind: "notFastForward"`)。
   */
  readonly updatePage: (
    base: PageToUpdate,
    lines: readonly string[],
    options?: UpdatePageOptions,
  ) => Promise<UpdatePageResult>
  /**
   * 1 行目をタイトルにして、`lines` の文で新しいページを作る。
   *
   * 同じタイトルのページがもうあれば、何も書かずに `PageExistsError` で reject する。Cosense と同じく、
   * 大文字と小文字、空白と `_` の違いは同じタイトルとして扱う。名前を変えたページの古いタイトルは、
   * もうあるものとしない。
   *
   * Cosense は同じタイトルを断らず、後ろに番号を付けて作る。そのため先に確かめるが、確かめてから
   * 作るまでのあいだにほかの人が同じタイトルで作ると、番号の付いたタイトルで作ることがある
   * (結果の `title`)。
   *
   * 1 行目が空か空白だけなら、何も送らずに `TypeError` で reject する。Cosense Web は前後の空白を
   * 除いてタイトルにするので、1 行目がタイトルにならない。
   */
  readonly createPage: (lines: readonly string[]) => Promise<CreatePageResult>
}

/**
 * 失敗を、effect が包んだもの (`FiberFailure`) ではなく `CosenseApiError` そのもので reject する。
 * `catch` した人が `instanceof CosenseApiError` や `status` で見分けられるように。
 */
const runOrReject = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromiseExit(effect).then(
    Exit.match({
      onSuccess: (value) => value,
      onFailure: (cause) => {
        // Promise.reject(…) を返すと、受け取る人のいないまま reject された Promise がいったんでき、
        // Cloudflare の workerd は、呼んだ人が catch していても未処理の reject として報告する。
        throw Cause.squash(cause)
      },
    }),
  )

/**
 * Cosense の API を呼ぶ関数をまとめて作る。
 *
 * @throws TypeError - `origin` が http(s) の origin でないとき
 *
 * @example
 * ```ts
 * const api = createCosenseApi({ pat: process.env.COSENSE_PAT })
 * const page = await api.project("help-jp").getPage("Cosense") // 無ければ null
 * ```
 */
export const createCosenseApi = (options: CosenseApiOptions = {}): CosenseApi => {
  const api = createCosenseApiEffect(options)
  const layer = Layer.succeed(
    HttpClient,
    httpClientOf((input, init) => (options.fetch ?? globalThis.fetch)(input, init)),
  )
  const run = <A, E>(effect: Effect.Effect<A, E, HttpClient>): Promise<A> =>
    runOrReject(Effect.provide(effect, layer))
  const orNull = <A>(
    effect: Effect.Effect<Option.Option<A>, CosenseApiError, HttpClient>,
  ): Promise<A | null> => run(Effect.map(effect, Option.getOrNull))

  const project = (name: string): CosenseProjectApi => {
    const bound = api.project(name)
    return {
      name: bound.name,
      getProject: () => run(bound.getProject()),
      listUsers: () => run(bound.listUsers()),
      listPages: (options) => run(bound.listPages(options)),
      getPage: (title) => orNull(bound.getPage(title)),
      getPageText: (title) => orNull(bound.getPageText(title)),
      getRelatedPages: (title) => run(bound.getRelatedPages(title)),
      getInfobox: (pageId) => run(bound.getInfobox(pageId)),
      getLiterateDatabase: (title) => orNull(bound.getLiterateDatabase(title)),
      exportForAi: (title, options) => run(bound.exportForAi(title, options)),
      searchFullText: (query) => run(bound.searchFullText(query)),
      searchVector: (query) => run(bound.searchVector(query)),
      listTitles: () => run(bound.listTitles()),
      listSnapshots: (pageId) => run(bound.listSnapshots(pageId)),
      getSnapshot: (pageId, snapshotId) => run(bound.getSnapshot(pageId, snapshotId)),
      previewEdit: (body) => run(bound.previewEdit(body)),
      submitEdit: (previewId) => run(bound.submitEdit(previewId)),
      replaceLinks: (from, to) => run(bound.replaceLinks(from, to)),
      markAccessed: (pageId) => run(bound.markAccessed(pageId)),
      disableInfoboxExtraction: (pageId, definitionTitle) =>
        run(bound.disableInfoboxExtraction(pageId, definitionTitle)),
      enableInfoboxExtraction: (pageId, definitionTitle) =>
        run(bound.enableInfoboxExtraction(pageId, definitionTitle)),
      requestInfoboxExtraction: (pageId) => run(bound.requestInfoboxExtraction(pageId)),
      updatePage: (base, lines, options) => run(bound.updatePage(base, lines, options)),
      createPage: (lines) => run(bound.createPage(lines)),
    }
  }

  return {
    getMe: () => run(api.getMe()),
    listProjects: () => run(api.listProjects()),
    fetchAsset: (url) => run(api.fetchAsset(url)),
    project,
  }
}
