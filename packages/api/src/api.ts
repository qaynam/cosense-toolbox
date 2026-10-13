import { Effect, Option, pipe, Schema } from "effect"

import { CosenseApiError, type PageConflictError } from "./errors"
import { HttpClient } from "./http-client"
import {
  type CosenseApiConfig,
  DEFAULT_ORIGIN,
  type ListPagesOptions,
  type UpdatePageOptions,
} from "./options"
import {
  Links1HopResponseSchema,
  Links2HopResponseSchema,
  ListPagesResponseSchema,
  MeSchema,
  PageSnapshotResponseSchema,
  PageSnapshotsResponseSchema,
  PageV2ResponseSchema,
  PreviewResponseSchema,
  ProjectDetailSchema,
  ProjectsResponseSchema,
  ProjectUsersResponseSchema,
  ReplaceLinksResponseSchema,
  SearchFullTextResponseSchema,
  SearchVectorResponseSchema,
  SubmitResponseSchema,
  TitleEntryArraySchema,
  TitleEntryEnvelopeSchema,
} from "./schemas"
import type {
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
} from "./types"
import { updatePageWith } from "./update-page"

type Call<A> = Effect.Effect<A, CosenseApiError, HttpClient>

/** {@link createCosenseApi} が返すもの。 */
export interface CosenseApi {
  readonly me: () => Call<Me>
  readonly projects: () => Call<readonly ProjectSummary[]>
  /** プロジェクトの設定。画像やファイルの送り先を含む。 */
  readonly projectDetail: (project: string) => Call<ProjectDetail>
  /** ページを書いた人として出てくる人全員。今のメンバーと、抜けたメンバー。 */
  readonly projectUsers: (project: string) => Call<ProjectUsers>
  readonly listPages: (
    project: string,
    options?: ListPagesOptions,
  ) => Call<{ readonly count: number; readonly pages: readonly PageSummary[] }>
  /**
   * ページの中身。名前を変えたページは、古いタイトルでも今のページを返す。
   * 無いページ (404) と、まだ書かれていないページ (`persistent: false`) は `none`。
   */
  readonly getPage: (project: string, title: string) => Call<Option.Option<PageDetail>>
  /** ページの本文をテキストのまま返す。1 行目がタイトル。無いページは `none`。 */
  readonly getPageText: (project: string, title: string) => Call<Option.Option<string>>
  /** 関連ページ。1 hop と 2 hop を並べて取り、それぞれ続きのページも辿る。 */
  readonly relatedPages: (project: string, title: string) => Call<RelatedPages>
  /**
   * Cosense の「AI 用にエクスポート」(Smart Context)。ページと、`hop` 以内のリンク先を 1 つの
   * テキストにする。`search` は、関連ページの欄と同じようにリンク先を絞る。
   */
  readonly exportForAi: (
    project: string,
    title: string,
    hop: 1 | 2,
    search?: string,
  ) => Call<string>
  /** 本文を全文検索する。pageRank の順に 100 件まで。 */
  readonly searchFullText: (project: string, query: string) => Call<SearchResult>
  /** タイトルのベクトル検索。使えないプロジェクトでは、失敗にせず空の結果を返す。 */
  readonly searchVector: (project: string, query: string) => Call<VectorResult>
  /** プロジェクトのすべてのページのタイトルと、そこから出ているリンク。 */
  readonly searchTitles: (project: string) => Call<readonly TitleEntry[]>
  /** ページの履歴。新しい順で、Cosense が返す最新の 100 件まで。 */
  readonly pageSnapshots: (project: string, pageId: string) => Call<readonly PageSnapshotEntry[]>
  readonly pageSnapshot: (project: string, pageId: string, snapshotId: string) => Call<PageSnapshot>
  /**
   * ページの書き換えを用意する。まだ書き換えない。`pagePreview.commitId` が手元の `commitId` と
   * 違えば、そのあいだにほかの人が書き換えている (そのまま送ると、その人の行を上書きする)。
   */
  readonly previewEdit: (project: string, body: PreviewEditBody) => Call<PreviewResponse>
  /** 用意した書き換え (`previewId`) をページに書く。 */
  readonly submitEdit: (project: string, previewId: string) => Call<SubmitResponse>
  /**
   * プロジェクトの中の `[from]` と `#from`、`[from.icon]` を、すべて `to` を指すように書き換える。
   * ページ自体のタイトルは変えない。大文字と小文字、空白と `_` の違いは区別しない。別のプロジェクトへの
   * リンク (`[/p/from]`) は書き換えない。500 が返ったら書き換え残しがあるが、同じ呼び出しをやり直してよい。
   */
  readonly replaceLinks: (
    project: string,
    from: string,
    to: string,
  ) => Call<{ readonly message: string }>
  /** ページを開いたことを記録する (未読でなくなる)。記録できなくても失敗しない。 */
  readonly markAccessed: (project: string, pageId: string) => Effect.Effect<void, never, HttpClient>
  /**
   * 読んだときのページ (`base`) を、`lines` の文にする。行の差分を作り、用意して書くまでをまとめて行う。
   *
   * 読んでから書くまでにほかの人が書き換えていたら、今のページを読み直して 3-way merge する。
   * 違う行の書き換えは合わせて書き、同じ行の書き換え (コンフリクト) は `whenConflict` に従う。
   * 既定では何も書かずに `PageConflictError` で失敗する。書き換えが続いたら、3 回試して諦める。
   */
  readonly updatePage: (
    project: string,
    base: PageToUpdate,
    lines: readonly string[],
    options?: UpdatePageOptions,
  ) => Effect.Effect<UpdatePageResult, CosenseApiError | PageConflictError, HttpClient>
}

// タイトルをパスに入れる形。日本語や空白は読める形のまま (空白は `_`) にし、
// パスの区切りやクエリに読まれてしまう文字だけを変える。
const encodeTitleForUrl = (title: string): string =>
  title
    .replace(/%/g, "%25")
    .replace(/\//g, "%2F")
    .replace(/\?/g, "%3F")
    .replace(/#/g, "%23")
    .replace(/ /g, "_")

const NOT_FOUND = 404
const VECTOR_SEARCH_DISABLED = 490
const FULL_TEXT_SEARCH_LIMIT = 100
/** 関連ページを 1 つの hop で何件まで辿るか。Cosense Web がページ送りをやめる数 */
const RELATED_LIMIT = 100_000
/** `search/titles` が 1 回に返す最大の件数 */
const TITLES_PER_PAGE = 10_000
/** `search/titles` を何回まで続けて取るか。続きがあると言い続けるサーバーでも止まるように */
const MAX_TITLE_PAGES = 20
/** 同じ origin へのリダイレクトを何回まで辿るか */
const MAX_REDIRECTS = 3

const isRedirect = (status: number): boolean => status >= 300 && status < 400

/** 本文の `{"error": "..."}` の値。JSON でないか、その形でなければ無い。 */
const errorCodeOf = (body: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      return typeof parsed.error === "string" ? parsed.error : undefined
    }
  } catch {}
  return undefined
}

/**
 * `location` を辿るときのパス。`origin` の外なら辿らない。
 *
 * リダイレクトを fetch に任せず (`redirect: "manual"`) ここで辿るのは、要求に PAT が付いているため。
 * 任せると、応答が指したサイトへ PAT を付けたまま送ってしまう。
 */
const sameOriginPath = (origin: string, location: string): Option.Option<string> => {
  try {
    const resolved = new URL(location, origin)
    return resolved.origin === new URL(origin).origin
      ? Option.some(`${resolved.pathname}${resolved.search}`)
      : Option.none()
  } catch {
    return Option.none()
  }
}

interface ApiRequest {
  readonly method?: "GET" | "POST"
  readonly body?: unknown
}

interface JsonResponse {
  readonly status: number
  readonly body: unknown
  /** 続きのページを応答のヘッダで知らせるエンドポイントのため */
  readonly headers: Headers
}

const notFoundAsNone = <A>(effect: Call<A>): Call<Option.Option<A>> =>
  pipe(
    effect,
    Effect.map(Option.some),
    Effect.catchIf(
      (error) => error.status === NOT_FOUND,
      () => Effect.succeed(Option.none()),
    ),
  )

/** API を呼ぶ関数をまとめて作る。どれも、要求を送る `HttpClient` が要る。 */
export const createCosenseApi = (config: CosenseApiConfig = {}): CosenseApi => {
  const origin = config.origin ?? DEFAULT_ORIGIN

  const headersFor = (hasBody: boolean): Record<string, string> => ({
    ...(config.pat === undefined ? {} : { "x-personal-access-token": config.pat }),
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
  })

  const requestRaw = (path: string, init: ApiRequest = {}, hop = 0): Call<Response> =>
    Effect.gen(function* () {
      const client = yield* HttpClient
      const hasBody = init.body !== undefined
      const response = yield* pipe(
        client.fetch(`${origin}${path}`, {
          method: init.method ?? "GET",
          headers: headersFor(hasBody),
          ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
          redirect: "manual",
        }),
        Effect.mapError(
          (error) =>
            new CosenseApiError({ status: 0, message: `Request failed: ${String(error.cause)}` }),
        ),
      )

      if (isRedirect(response.status)) {
        const next = pipe(
          Option.fromNullable(response.headers.get("location")),
          Option.flatMap((location) => sameOriginPath(origin, location)),
          Option.filter(() => hop < MAX_REDIRECTS),
        )
        if (Option.isSome(next)) return yield* requestRaw(next.value, init, hop + 1)
        return yield* Effect.fail(
          new CosenseApiError({
            status: response.status,
            message: `Unexpected redirect (HTTP ${response.status})`,
          }),
        )
      }
      if (!response.ok) {
        const body = yield* Effect.orElseSucceed(
          Effect.tryPromise(() => response.text()),
          () => "",
        )
        const code = errorCodeOf(body)
        return yield* Effect.fail(
          new CosenseApiError({
            status: response.status,
            message: `HTTP ${response.status} ${response.statusText}`.trim(),
            ...(code === undefined ? {} : { code }),
          }),
        )
      }
      return response
    })

  const bodyOf = <A>(response: Response, as: "json" | "text", body: () => Promise<A>): Call<A> =>
    Effect.tryPromise({
      try: body,
      catch: (cause) =>
        new CosenseApiError({
          status: response.status,
          code: "DecodeError",
          message: `Response body was not valid ${as}: ${String(cause)}`,
        }),
    })

  const request = (path: string, init?: ApiRequest): Call<JsonResponse> =>
    Effect.flatMap(requestRaw(path, init), (response) =>
      Effect.map(
        bodyOf(response, "json", () => response.json()),
        (body) => ({
          status: response.status,
          body,
          headers: response.headers,
        }),
      ),
    )

  const requestText = (path: string): Call<string> =>
    Effect.flatMap(requestRaw(path), (response) => bodyOf(response, "text", () => response.text()))

  const decode =
    <A, I>(schema: Schema.Schema<A, I>) =>
    (response: JsonResponse): Effect.Effect<A, CosenseApiError> =>
      Effect.mapError(
        Schema.decodeUnknown(schema)(response.body),
        (error) =>
          new CosenseApiError({
            status: response.status,
            code: "DecodeError",
            message: error.message,
          }),
      )

  const get = <A, I>(path: string, schema: Schema.Schema<A, I>): Call<A> =>
    Effect.flatMap(request(path), decode(schema))

  const relatedPages: CosenseApi["relatedPages"] = (project, title) => {
    const base = `/api/pages/v2/${project}/${encodeTitleForUrl(title)}`
    // 1 つの hop のページを、続きが無くなるか RELATED_LIMIT に届くまで順に取る。
    // 最初の要求にはクエリを付けない (サーバーは最初のページを返す)。
    const allOf = <
      A extends { readonly pagination: { hasNext: boolean; nextId: string | null } },
      I,
    >(
      hop: "links1hop" | "links2hop",
      schema: Schema.Schema<A, I>,
      count: (response: A) => number,
    ): Call<A[]> =>
      pipe(
        Effect.iterate(
          { responses: [] as A[], nextId: Option.none<string>(), total: 0, done: false },
          {
            while: (state) => !state.done,
            body: (state) =>
              Effect.map(
                get(
                  Option.match(state.nextId, {
                    onNone: () => `${base}/${hop}`,
                    onSome: (nextId) => `${base}/${hop}?nextId=${encodeURIComponent(nextId)}`,
                  }),
                  schema,
                ),
                (response) => {
                  const total = state.total + count(response)
                  const nextId = Option.fromNullable(response.pagination.nextId)
                  return {
                    responses: [...state.responses, response],
                    nextId,
                    total,
                    done:
                      !response.pagination.hasNext ||
                      Option.isNone(nextId) ||
                      total >= RELATED_LIMIT,
                  }
                },
              ),
          },
        ),
        Effect.map((state) => state.responses),
      )

    return Effect.map(
      Effect.all(
        [
          allOf("links1hop", Links1HopResponseSchema, (response) => response.links1hop.length),
          allOf("links2hop", Links2HopResponseSchema, (response) => response.links2hop.length),
        ],
        { concurrency: "unbounded" },
      ),
      ([hop1, hop2]) => {
        const links1hop = hop1.flatMap((response) => response.links1hop)
        const inFirstHop = new Set(links1hop.map((page) => page.titleLc).filter((lc) => lc !== ""))
        const last2 = hop2.at(-1)
        return {
          links1hop,
          links2hop: hop2
            .flatMap((response) => response.links2hop)
            .filter((page) => !inFirstHop.has(page.titleLc)),
          hiddenHeadwordsLc: last2?.hiddenHeadwordsLc ?? [],
          synonyms: [...(hop1.at(-1)?.synonyms ?? []), ...(last2?.synonyms ?? [])],
        }
      },
    )
  }

  // 1 回に TITLES_PER_PAGE 件までしか返らず、続きの位置を `x-following-id` で知らせる。
  // 大きいプロジェクトでは最初の回だけで止めると、ほとんどのページを無いものとして扱ってしまう。
  const searchTitles: CosenseApi["searchTitles"] = (project) => {
    const titlesPage = (followingId: Option.Option<string>) =>
      Effect.flatMap(
        request(
          Option.match(followingId, {
            onNone: () => `/api/pages/${project}/search/titles`,
            onSome: (id) => `/api/pages/${project}/search/titles?followingId=${id}`,
          }),
        ),
        (response) =>
          Effect.map(
            Array.isArray(response.body)
              ? decode(TitleEntryArraySchema)(response)
              : Effect.map(decode(TitleEntryEnvelopeSchema)(response), (data) => data.pages),
            (titles) => ({
              titles,
              next: Option.fromNullable(response.headers.get("x-following-id")).pipe(
                Option.filter((id) => id !== ""),
              ),
            }),
          ),
      )

    return pipe(
      Effect.iterate(
        { titles: [] as TitleEntry[], next: Option.none<string>(), pages: 0, done: false },
        {
          while: (state) => !state.done,
          body: (state) =>
            Effect.map(titlesPage(state.next), ({ titles, next }) => ({
              titles: [...state.titles, ...titles],
              next,
              pages: state.pages + 1,
              done:
                Option.isNone(next) ||
                titles.length < TITLES_PER_PAGE ||
                state.pages + 1 >= MAX_TITLE_PAGES,
            })),
        },
      ),
      Effect.map((state) => state.titles),
    )
  }

  const operations = {
    me: () => get("/api/users/me", MeSchema),

    projects: () =>
      Effect.map(get("/api/projects", ProjectsResponseSchema), (data) => data.projects),

    projectDetail: (project) =>
      get(`/api/projects/${encodeURIComponent(project)}`, ProjectDetailSchema),

    projectUsers: (project) =>
      Effect.map(
        get(`/api/projects/${encodeURIComponent(project)}/users`, ProjectUsersResponseSchema),
        (data) => ({
          projectId: data.projectId,
          users: [
            ...data.users,
            ...data.memberSnapshots.flatMap((snapshot) =>
              Option.toArray(Option.fromNullable(snapshot.data)),
            ),
          ],
        }),
      ),

    listPages: (project, options = {}) => {
      const params = new URLSearchParams()
      if (options.sort !== undefined) params.set("sort", options.sort)
      if (options.limit !== undefined) params.set("limit", String(options.limit))
      if (options.skip !== undefined) params.set("skip", String(options.skip))
      if (options.filterType !== undefined && options.filterValue !== undefined) {
        params.set("filterType", options.filterType)
        params.set("filterValue", options.filterValue)
      }
      const query = params.toString()
      return get(
        `/api/pages/${project}/${query === "" ? "" : `?${query}`}`,
        ListPagesResponseSchema,
      )
    },

    // followRename: 名前を変える前のタイトルで書いたリンクからも、今のページを引けるようにする。
    getPage: (project, title) =>
      pipe(
        get(
          `/api/pages/v2/${project}/${encodeTitleForUrl(title)}/?followRename=true`,
          PageV2ResponseSchema,
        ),
        Effect.map((data) =>
          data.persistent
            ? Option.some<PageDetail>({
                id: data.id,
                title: data.title ?? title,
                commitId: data.commitId,
                lines: data.lines,
                created: data.created,
                updated: data.updated,
                accessed: data.accessed,
                views: data.views,
                linked: data.linked,
                linesCount: data.linesCount,
                charsCount: data.charsCount,
                pin: data.pin,
                pageRank: data.pageRank,
                snapshotCount: data.snapshotCount,
                ...(data.user ? { user: data.user } : {}),
                ...(data.users.length > 0 ? { users: data.users } : {}),
                ...(data.lastUpdateUser ? { lastUpdateUser: data.lastUpdateUser } : {}),
              })
            : Option.none(),
        ),
        notFoundAsNone,
        Effect.map(Option.flatten),
      ),

    getPageText: (project, title) =>
      notFoundAsNone(requestText(`/api/pages/${project}/${encodeTitleForUrl(title)}/text`)),

    relatedPages,

    exportForAi: (project, title, hop, search) => {
      // タイトルはクエリに入るので、encodeTitleForUrl (パス用) ではなく普通にエンコードする。
      const query = new URLSearchParams({ title })
      const filter = search?.trim() ?? ""
      if (filter !== "") query.append("search", filter)
      return requestText(
        `/api/smart-context/export-${hop}hop-links/${encodeURIComponent(project)}.txt?${query.toString()}`,
      )
    },

    searchFullText: (project, query) =>
      get(
        `/api/pages/${project}/search/query?${new URLSearchParams({
          q: query,
          skip: "0",
          limit: String(FULL_TEXT_SEARCH_LIMIT),
          sort: "pageRank",
          // field=lines で本文を探す (無ければタイトルの検索になる)
          field: "lines",
        })}`,
        SearchFullTextResponseSchema,
      ),

    searchVector: (project, query) =>
      pipe(
        get(
          `/api/pages/${project}/search/vector/titles?q=${encodeURIComponent(query)}`,
          SearchVectorResponseSchema,
        ),
        Effect.catchIf(
          (error) => error.status === VECTOR_SEARCH_DISABLED,
          () => Effect.succeed<VectorResult>({ pages: [] }),
        ),
      ),

    searchTitles,

    pageSnapshots: (project, pageId) =>
      Effect.map(
        get(
          `/api/page-snapshots/${project}/${encodeURIComponent(pageId)}`,
          PageSnapshotsResponseSchema,
        ),
        (data) => data.timestamps.filter((entry) => entry.id !== ""),
      ),

    pageSnapshot: (project, pageId, snapshotId) =>
      Effect.map(
        get(
          `/api/page-snapshots/${project}/${encodeURIComponent(pageId)}/${encodeURIComponent(snapshotId)}`,
          PageSnapshotResponseSchema,
        ),
        (data) => data.snapshot,
      ),

    previewEdit: (project, body) =>
      Effect.flatMap(
        request(`/api/pages/v2/${project}/page-edit-for-ai/preview`, { method: "POST", body }),
        decode(PreviewResponseSchema),
      ),

    submitEdit: (project, previewId) =>
      Effect.flatMap(
        request(`/api/pages/v2/${project}/page-edit-for-ai/submit`, {
          method: "POST",
          body: { previewId },
        }),
        decode(SubmitResponseSchema),
      ),

    replaceLinks: (project, from, to) =>
      Effect.flatMap(
        request(`/api/pages/${project}/replace/links`, { method: "POST", body: { from, to } }),
        decode(ReplaceLinksResponseSchema),
      ),

    // 記録は付け足しなので、できなくてもページを読むことは止めない。POST を断られたら GET で記録する。
    markAccessed: (project, pageId) => {
      const path = `/api/pages/${project}/${encodeURIComponent(pageId)}/accessed`
      return pipe(
        request(path, { method: "POST", body: {} }),
        Effect.orElse(() => request(path)),
        Effect.asVoid,
        Effect.orElse(() => Effect.void),
      )
    },
  } satisfies Omit<CosenseApi, "updatePage">

  return { ...operations, updatePage: updatePageWith(operations) }
}
