/**
 * `@cosense-toolbox/api`。中は effect で書いているが、ここで渡すものは素の型にする。
 * 時間のかかるものは `Promise`、無いものは `null` で返し、失敗は `CosenseApiError` で reject する。
 * effect の型のまま使いたい人は `@cosense-toolbox/api/effect` を使う。
 */
import { Cause, Effect, Exit, Layer, Option } from "effect"

import { createCosenseApi as createCosenseApiEffect } from "../api"
import type { CosenseApiError } from "../errors"
import { HttpClient, httpClientOf } from "../http-client"
import type { CosenseApiConfig, ListPagesOptions } from "../options"
import type {
  Me,
  PageDetail,
  PageSnapshot,
  PageSnapshotEntry,
  PageSummary,
  ProjectDetail,
  ProjectSummary,
  ProjectUsers,
  RelatedPages,
  SearchResult,
  TitleEntry,
  VectorResult,
} from "../types"

export { CosenseApiError } from "../errors"
export type { ListPagesOptions } from "../options"
export type * from "../types"

export interface CosenseApiOptions extends CosenseApiConfig {
  /** 要求を送る fetch。テストや、キャッシュを挟みたいときに渡す。 @defaultValue 呼んだときの `globalThis.fetch` */
  readonly fetch?: typeof globalThis.fetch
}

/** {@link createCosenseApi} が返すもの。失敗はどれも `CosenseApiError` で reject する。 */
export interface CosenseApi {
  readonly me: () => Promise<Me>
  readonly projects: () => Promise<readonly ProjectSummary[]>
  /** プロジェクトの設定。画像やファイルの送り先を含む。 */
  readonly projectDetail: (project: string) => Promise<ProjectDetail>
  /** ページを書いた人として出てくる人全員。今のメンバーと、抜けたメンバー。 */
  readonly projectUsers: (project: string) => Promise<ProjectUsers>
  readonly listPages: (
    project: string,
    options?: ListPagesOptions,
  ) => Promise<{ readonly count: number; readonly pages: readonly PageSummary[] }>
  /**
   * ページの中身。名前を変えたページは、古いタイトルでも今のページを返す。
   * 無いページと、まだ書かれていないページは `null`。
   */
  readonly getPage: (project: string, title: string) => Promise<PageDetail | null>
  /** ページの本文をテキストのまま返す。1 行目がタイトル。無いページは `null`。 */
  readonly getPageText: (project: string, title: string) => Promise<string | null>
  /** 関連ページ。1 hop と 2 hop を並べて取り、それぞれ続きのページも辿る。 */
  readonly relatedPages: (project: string, title: string) => Promise<RelatedPages>
  /**
   * Cosense の「AI 用にエクスポート」(Smart Context)。ページと、`hop` 以内のリンク先を 1 つの
   * テキストにする。`search` は、関連ページの欄と同じようにリンク先を絞る。
   */
  readonly exportForAi: (
    project: string,
    title: string,
    hop: 1 | 2,
    search?: string,
  ) => Promise<string>
  /** 本文を全文検索する。pageRank の順に 100 件まで。 */
  readonly searchFullText: (project: string, query: string) => Promise<SearchResult>
  /** タイトルのベクトル検索。使えないプロジェクトでは、失敗にせず空の結果を返す。 */
  readonly searchVector: (project: string, query: string) => Promise<VectorResult>
  /** プロジェクトのすべてのページのタイトルと、そこから出ているリンク。 */
  readonly searchTitles: (project: string) => Promise<readonly TitleEntry[]>
  /** ページの履歴。新しい順で、Cosense が返す最新の 100 件まで。 */
  readonly pageSnapshots: (project: string, pageId: string) => Promise<readonly PageSnapshotEntry[]>
  readonly pageSnapshot: (
    project: string,
    pageId: string,
    snapshotId: string,
  ) => Promise<PageSnapshot>
}

/**
 * 失敗を、effect が包んだもの (`FiberFailure`) ではなく `CosenseApiError` そのもので reject する。
 * `catch` した人が `instanceof CosenseApiError` や `status` で見分けられるように。
 */
const runOrReject = <A>(effect: Effect.Effect<A, CosenseApiError>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) =>
    Exit.isSuccess(exit) ? exit.value : Promise.reject(Cause.squash(exit.cause)),
  )

/**
 * Cosense の API を呼ぶ関数をまとめて作る。
 *
 * @example
 * ```ts
 * const api = createCosenseApi({ pat: process.env.COSENSE_PAT })
 * const page = await api.getPage("project", "title") // 無ければ null
 * ```
 */
export const createCosenseApi = (options: CosenseApiOptions = {}): CosenseApi => {
  const api = createCosenseApiEffect(options)
  const layer = Layer.succeed(
    HttpClient,
    httpClientOf((input, init) => (options.fetch ?? globalThis.fetch)(input, init)),
  )
  const run = <A>(effect: Effect.Effect<A, CosenseApiError, HttpClient>): Promise<A> =>
    runOrReject(Effect.provide(effect, layer))
  const orNull = <A>(
    effect: Effect.Effect<Option.Option<A>, CosenseApiError, HttpClient>,
  ): Promise<A | null> => run(Effect.map(effect, Option.getOrNull))

  return {
    me: () => run(api.me()),
    projects: () => run(api.projects()),
    projectDetail: (project) => run(api.projectDetail(project)),
    projectUsers: (project) => run(api.projectUsers(project)),
    listPages: (project, options) => run(api.listPages(project, options)),
    getPage: (project, title) => orNull(api.getPage(project, title)),
    getPageText: (project, title) => orNull(api.getPageText(project, title)),
    relatedPages: (project, title) => run(api.relatedPages(project, title)),
    exportForAi: (project, title, hop, search) => run(api.exportForAi(project, title, hop, search)),
    searchFullText: (project, query) => run(api.searchFullText(project, query)),
    searchVector: (project, query) => run(api.searchVector(project, query)),
    searchTitles: (project) => run(api.searchTitles(project)),
    pageSnapshots: (project, pageId) => run(api.pageSnapshots(project, pageId)),
    pageSnapshot: (project, pageId, snapshotId) =>
      run(api.pageSnapshot(project, pageId, snapshotId)),
  }
}
