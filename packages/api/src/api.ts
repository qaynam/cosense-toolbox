import { Effect, Option, pipe, Schema } from "effect"

import { createPageWith } from "./create-page"
import { CosenseApiError, type PageConflictError, type PageExistsError } from "./errors"
import { HttpClient } from "./http-client"
import { literateDatabaseOf } from "./literate-database"
import {
  type CosenseApiConfig,
  type ExportForAiOptions,
  type ListPagesOptions,
  originOf,
  type UpdatePageOptions,
} from "./options"
import {
  ErrorBodySchema,
  InfoboxSchema,
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
  RelatedPage,
  RelatedPages,
  SearchResult,
  SubmitResponse,
  TitleEntry,
  UpdatePageResult,
  VectorResult,
} from "./types"
import { updatePageWith } from "./update-page"

type Call<A> = Effect.Effect<A, CosenseApiError, HttpClient>

/** {@link createCosenseApi} が返すもの。プロジェクトの中のものは `project(name)` から呼ぶ。 */
export interface CosenseApi {
  readonly getMe: () => Call<Me>
  readonly listProjects: () => Call<readonly ProjectSummary[]>
  /**
   * Cosense 上のファイル (アップロードした `/files/…` やアイコン) の中身を取ってくる。
   *
   * これらは `Cross-Origin-Resource-Policy: same-origin` を返すので別のサイトの `<img>` からは読めず、
   * リダイレクト先の URL も期限付き (`/files/` は 5 分) なので、静的なサイトには中身を置く必要がある。
   * ファイルは別の場所 (Google Cloud Storage や Gyazo) へリダイレクトされるので、5 回まで辿る。
   * PAT は `origin` への要求にだけ付け、リダイレクト先には送らない。
   * 渡した URL もリダイレクト先も、http(s) でなければ取りに行かずに `kind: "invalidUrl"` で失敗する。
   */
  readonly fetchAsset: (url: string) => Call<FetchedAsset>
  /**
   * プロジェクト `name` の中のものを呼ぶ関数をまとめて返す。`name` はエンコードしてパスに入れる。
   *
   * @throws TypeError - `name` が空か、`.` か `..` のとき
   */
  readonly project: (name: string) => CosenseProjectApi
}

/** {@link CosenseApi.project} が返すもの。どれも、そのプロジェクトの中のものを呼ぶ。 */
export interface CosenseProjectApi {
  /** `project` に渡したプロジェクトの名前 (エンコードする前)。 */
  readonly name: string
  /** プロジェクトの設定。画像やファイルの送り先を含む。 */
  readonly getProject: () => Call<ProjectDetail>
  /** ページを書いた人として出てくる人全員。今のメンバーと、抜けたメンバー。 */
  readonly listUsers: () => Call<ProjectUsers>
  readonly listPages: (
    options?: ListPagesOptions,
  ) => Call<{ readonly count: number; readonly pages: readonly PageSummary[] }>
  /**
   * ページの中身。名前を変えたページは、古いタイトルでも今のページを返す。
   * 無いページ (404) と、まだ書かれていないページ (`persistent: false`) は `none`。
   */
  readonly getPage: (title: string) => Call<Option.Option<PageDetail>>
  /** ページの本文をテキストのまま返す。1 行目がタイトル。無いページは `none`。 */
  readonly getPageText: (title: string) => Call<Option.Option<string>>
  /** 関連ページ。1 hop と 2 hop を並べて取り、それぞれ続きのページも辿る。 */
  readonly getRelatedPages: (title: string) => Call<RelatedPages>
  /** ページの Infobox だけを読む。`getPage` の結果にも同じものが入っている。 */
  readonly getInfobox: (pageId: string) => Call<Infobox>
  /**
   * 定義ページの表 (文芸的データベース)。Cosense Web が定義ページの下に出す表と、同じ行と列を返す。
   * 名前を変えたページは、古いタイトルでも今のページの表を返す。ページが無いか、定義ページでなければ `none`。
   */
  readonly getLiterateDatabase: (title: string) => Call<Option.Option<LiterateDatabase>>
  /**
   * Cosense の「AI 用にエクスポート」(Smart Context)。ページと、`hop` 以内のリンク先を 1 つの
   * テキストにする。
   */
  readonly exportForAi: (title: string, options?: ExportForAiOptions) => Call<string>
  /** 本文を全文検索する。pageRank の順に 100 件まで。 */
  readonly searchFullText: (query: string) => Call<SearchResult>
  /** タイトルのベクトル検索。使えないプロジェクトでは、失敗にせず空の結果を返す。 */
  readonly searchVector: (query: string) => Call<VectorResult>
  /**
   * プロジェクトのすべてのページのタイトルと、そこから出ているリンク。
   *
   * 1 回に 1 万件ずつ、続きが無くなるまで要求する。途中までを返すことはない。Cosense が示す続きの位置が
   * 前に辿ったところへ戻ったら、終わらないので `CosenseApiError` で失敗する。
   */
  readonly listTitles: () => Call<readonly TitleEntry[]>
  /** ページの履歴。新しい順で、Cosense が返す最新の 100 件まで。 */
  readonly listSnapshots: (pageId: string) => Call<readonly PageSnapshotEntry[]>
  readonly getSnapshot: (pageId: string, snapshotId: string) => Call<PageSnapshot>
  /**
   * ページの書き換えを用意する。まだ書き換えない。`pagePreview.commitId` が手元の `commitId` と
   * 違えば、そのあいだにほかの人が書き換えている (そのまま送ると、その人の行を上書きする)。
   */
  readonly previewEdit: (body: PreviewEditBody) => Call<PreviewResponse>
  /** 用意した書き換え (`previewId`) をページに書く。 */
  readonly submitEdit: (previewId: string) => Call<SubmitResponse>
  /**
   * プロジェクトの中の `[from]` と `#from`、`[from.icon]` を、すべて `to` を指すように書き換える。
   * ページ自体のタイトルは変えない。大文字と小文字、空白と `_` の違いは区別しない。別のプロジェクトへの
   * リンク (`[/p/from]`) は書き換えない。500 が返ったら書き換え残しがあるが、同じ呼び出しをやり直してよい。
   */
  readonly replaceLinks: (from: string, to: string) => Call<{ readonly message: string }>
  /** ページを開いたことを記録する (未読でなくなる)。記録できなくても失敗しない。 */
  readonly markAccessed: (pageId: string) => Effect.Effect<void, never, HttpClient>
  /**
   * このページで、定義ページ `definitionTitle` の項目を抜き出すのを止める (Cosense Web の
   * 「disable extraction」)。定義ページへのリンクはそのままで、定義ページの表 (文芸的データベース) から
   * このページが外れる。止めた後の、このページの Infobox を返す。
   */
  readonly disableInfoboxExtraction: (pageId: string, definitionTitle: string) => Call<Infobox>
  /**
   * 止めた抜き出しを戻す。戻した後の、このページの Infobox を返す。Cosense Web は、戻した後に
   * `requestInfoboxExtraction` で抜き出し直す。
   */
  readonly enableInfoboxExtraction: (pageId: string, definitionTitle: string) => Call<Infobox>
  /**
   * このページの本文から Infobox を抜き出し直すよう、Cosense に頼む。抜き出した値は `getInfobox` で読む。
   *
   * Cosense Web は、定義ページの表を書き換えると、関連ページ (1 hop) のそれぞれにこれを頼む。
   * `updatePage` で定義ページの表を書き換えたときは、要るなら自分で頼む。
   */
  readonly requestInfoboxExtraction: (pageId: string) => Call<void>
  /**
   * 読んだときのページ (`base`) を、`lines` の文にする。行の差分を作り、用意して書くまでをまとめて行う。
   *
   * 読んでから書くまでにほかの人が書き換えていたら、今のページを読み直して 3-way merge する。
   * 違う行の書き換えは合わせて書き、同じ行の書き換え (コンフリクト) は `whenConflict` に従う。
   * 既定では何も書かずに `PageConflictError` で失敗する。書き換えが続いたら、3 回試して諦める。
   */
  readonly updatePage: (
    base: PageToUpdate,
    lines: readonly string[],
    options?: UpdatePageOptions,
  ) => Effect.Effect<UpdatePageResult, CosenseApiError | PageConflictError, HttpClient>
  /**
   * 1 行目をタイトルにして、`lines` の文で新しいページを作る。
   *
   * 同じタイトルのページがもうあれば、何も書かずに `PageExistsError` で失敗する。Cosense と同じく、
   * 大文字と小文字、空白と `_` の違いは同じタイトルとして扱う。名前を変えたページの古いタイトルは、
   * もうあるものとしない。
   *
   * Cosense は同じタイトルを断らず、後ろに番号を付けて作る。そのため先に確かめるが、確かめてから
   * 作るまでのあいだにほかの人が同じタイトルで作ると、番号の付いたタイトルで作ることがある
   * (結果の `title`)。
   */
  readonly createPage: (
    lines: readonly string[],
  ) => Effect.Effect<CreatePageResult, CosenseApiError | PageExistsError, HttpClient>
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

/**
 * プロジェクトの名前を、パスの 1 つの区切りにする。空の名前は区切りにならず、`.` と `..` は `%2E` に
 * しても URL の決まりで今の階層や上の階層を指すので、断る。
 */
const projectSegmentOf = (name: string): string => {
  if (name === "" || name === "." || name === "..") {
    throw new TypeError(`project name must not be empty, "." or "..": ${JSON.stringify(name)}`)
  }
  return encodeURIComponent(name)
}

const NOT_FOUND = 404
const VECTOR_SEARCH_DISABLED = 490
const FULL_TEXT_SEARCH_LIMIT = 100
/** 関連ページを 1 つの hop で何件まで辿るか。Cosense Web がページ送りをやめる数 */
const RELATED_LIMIT = 100_000
/** `search/titles` が 1 回に返す最大の件数 */
const TITLES_PER_PAGE = 10_000
/** 同じ origin へのリダイレクトを何回まで辿るか */
const MAX_REDIRECTS = 3
/** ファイルを取るときに、リダイレクトを何回まで辿るか */
const MAX_ASSET_REDIRECTS = 5

const isRedirect = (status: number): boolean => status >= 300 && status < 400

// Bun の fetch は file: の URL も読むので、リダイレクト先も含めて http(s) 以外は取りに行かない。
const httpUrlOf = (text: string, base?: string): Option.Option<URL> =>
  pipe(
    Option.liftThrowable(() => new URL(text, base))(),
    Option.filter((url) => url.protocol === "http:" || url.protocol === "https:"),
  )

/** エラーの文に入れる、本文の文の長さの上限 */
const DETAIL_LIMIT = 200

/**
 * 本文が 100 KiB を超えると、scrapbox.io は 413 ではなく 400 で、本文に `request entity too large`
 * とだけ返す (scrapbox.io で測った)。
 */
const TOO_LARGE_BODY = /request entity too large/i

/**
 * 2xx 以外の応答の本文から、`code` と、エラーの文に足す説明を読む。JSON でない本文は、そのまま
 * 説明にする。HTML のエラーページは長いだけで読めないので、説明にしない。
 */
const errorBodyOf = (
  body: string,
): { readonly code: string | undefined; readonly detail: string | undefined } =>
  pipe(
    Schema.decodeUnknownOption(ErrorBodySchema)(body),
    Option.match({
      onSome: (parsed) => ({ code: parsed.error ?? parsed.name, detail: parsed.message }),
      onNone: () => {
        const text = body.trim()
        return {
          code: undefined,
          detail: text === "" || text.startsWith("<") ? undefined : text.slice(0, DETAIL_LIMIT),
        }
      },
    }),
  )

/**
 * `location` を辿るときのパス。`origin` の外なら辿らない。
 *
 * リダイレクトを fetch に任せず (`redirect: "manual"`) ここで辿るのは、要求に PAT が付いているため。
 * 任せると、応答が指したサイトへ PAT を付けたまま送ってしまう。
 */
const sameOriginPath = (origin: string, location: string): Option.Option<string> => {
  try {
    const resolved = new URL(location, origin)
    return resolved.origin === origin
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

/**
 * API を呼ぶ関数をまとめて作る。どれも、要求を送る `HttpClient` が要る。
 *
 * @throws TypeError - `origin` が http(s) の origin でないとき
 */
export const createCosenseApi = (config: CosenseApiConfig = {}): CosenseApi => {
  const origin = originOf(config.origin)

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
        const { code, detail } = errorBodyOf(body)
        const summary = `HTTP ${response.status} ${response.statusText}`.trim()
        return yield* Effect.fail(
          new CosenseApiError({
            status: response.status,
            message: detail === undefined ? summary : `${summary}: ${detail}`,
            ...(code === undefined ? {} : { code }),
            ...(TOO_LARGE_BODY.test(body) ? { kind: "tooLarge" as const } : {}),
          }),
        )
      }
      return response
    })

  const bodyOf = <A>(
    response: Response,
    as: "json" | "text" | "bytes",
    body: () => Promise<A>,
  ): Call<A> =>
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

  // 1 つの hop のページを、続きが無くなるか RELATED_LIMIT に届くまで順に取る。
  // 最初の要求にはクエリを付けない (サーバーは最初のページを返す)。
  const allOf = <A extends { readonly pagination: { hasNext: boolean; nextId: string | null } }, I>(
    base: string,
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
                    !response.pagination.hasNext || Option.isNone(nextId) || total >= RELATED_LIMIT,
                }
              },
            ),
        },
      ),
      Effect.map((state) => state.responses),
    )

  // リダイレクトは fetch に任せず自分で辿る。任せると、PAT を付けたまま別のオリジンへ送ってしまう。
  // ほかの API と違ってファイルは別のオリジンへ転送されるので、そこへも辿るが、PAT は付けない。
  const fetchAsset: CosenseApi["fetchAsset"] = (url) => {
    const follow = (current: URL, redirects: number): Call<FetchedAsset> =>
      Effect.gen(function* () {
        const client = yield* HttpClient
        const response = yield* pipe(
          client.fetch(current.href, {
            redirect: "manual",
            headers: current.origin === origin ? headersFor(false) : {},
          }),
          Effect.mapError(
            (error) =>
              new CosenseApiError({
                status: 0,
                message: `Request failed: ${String(error.cause)}`,
              }),
          ),
        )
        const location = response.headers.get("location")
        if (isRedirect(response.status) && location !== null) {
          if (redirects >= MAX_ASSET_REDIRECTS) {
            return yield* Effect.fail(
              new CosenseApiError({
                status: response.status,
                message: `Too many redirects (more than ${MAX_ASSET_REDIRECTS}): ${url}`,
              }),
            )
          }
          const next = httpUrlOf(location, current.href)
          if (Option.isNone(next)) {
            return yield* Effect.fail(
              new CosenseApiError({
                status: response.status,
                kind: "invalidUrl",
                message: `Redirected to a URL that is not http(s): ${location}`,
              }),
            )
          }
          return yield* follow(next.value, redirects + 1)
        }
        if (!response.ok) {
          return yield* Effect.fail(
            new CosenseApiError({
              status: response.status,
              message: `HTTP ${response.status} ${response.statusText}: ${url}`.trim(),
            }),
          )
        }
        const data = yield* bodyOf(response, "bytes", () => response.arrayBuffer())
        return {
          data: new Uint8Array(data),
          contentType: response.headers.get("content-type") ?? "",
        }
      })
    return Option.match(httpUrlOf(url), {
      onNone: () =>
        Effect.fail(
          new CosenseApiError({
            status: 0,
            kind: "invalidUrl",
            message: `Not an http(s) URL: ${url}`,
          }),
        ),
      onSome: (start) => follow(start, 0),
    })
  }

  const project = (name: string): CosenseProjectApi => {
    const segment = projectSegmentOf(name)

    const relatedBaseOf = (title: string): string =>
      `/api/pages/v2/${segment}/${encodeTitleForUrl(title)}`

    const links1hopOf = (title: string): Call<RelatedPage[]> =>
      Effect.map(
        allOf(
          relatedBaseOf(title),
          "links1hop",
          Links1HopResponseSchema,
          (response) => response.links1hop.length,
        ),
        (responses) => responses.flatMap((response) => response.links1hop),
      )

    // 抜き出しを止めた定義ページの一覧 (`infoboxDisableLinks`) に、足す (`"add"`) と止まり、除く (`"remove"`) と戻る。
    const setInfoboxExtraction = (
      pageId: string,
      definitionTitle: string,
      action: "add" | "remove",
    ): Call<Infobox> =>
      Effect.flatMap(
        request(`/api/pages/${segment}/${encodeURIComponent(pageId)}/infobox/disable-links`, {
          method: "POST",
          body: { title: definitionTitle, action },
        }),
        decode(InfoboxSchema),
      )

    // 1 回に TITLES_PER_PAGE 件までしか返らず、続きの位置を `x-following-id` で知らせる。
    // 大きいプロジェクトでは最初の回だけで止めると、ほとんどのページを無いものとして扱ってしまう。
    // 件数の上限で止めても同じく黙って途中までになるので、上限は設けない。続きの位置が前に辿った
    // ところへ戻ったときだけ、終わらないので失敗にする。
    const listTitles: CosenseProjectApi["listTitles"] = () => {
      const titlesPage = (followingId: Option.Option<string>) =>
        Effect.flatMap(
          request(
            Option.match(followingId, {
              onNone: () => `/api/pages/${segment}/search/titles`,
              onSome: (id) => `/api/pages/${segment}/search/titles?followingId=${id}`,
            }),
          ),
          (response) =>
            Effect.map(
              Array.isArray(response.body)
                ? decode(TitleEntryArraySchema)(response)
                : Effect.map(decode(TitleEntryEnvelopeSchema)(response), (data) => data.pages),
              (titles) => ({
                titles,
                status: response.status,
                next: Option.fromNullable(response.headers.get("x-following-id")).pipe(
                  Option.filter((id) => id !== ""),
                ),
              }),
            ),
        )

      return pipe(
        Effect.iterate(
          {
            titles: [] as TitleEntry[],
            next: Option.none<string>(),
            followed: new Set<string>() as ReadonlySet<string>,
            done: false,
          },
          {
            while: (state) => !state.done,
            body: (state) =>
              Effect.flatMap(titlesPage(state.next), ({ titles, status, next }) => {
                const followed = Option.match(state.next, {
                  onNone: () => state.followed,
                  onSome: (id) => new Set([...state.followed, id]),
                })
                const done = Option.isNone(next) || titles.length < TITLES_PER_PAGE
                if (!done && followed.has(next.value)) {
                  return Effect.fail(
                    new CosenseApiError({
                      status,
                      message: `search/titles went back to a position it had already returned (x-following-id: ${next.value})`,
                    }),
                  )
                }
                return Effect.succeed({
                  titles: [...state.titles, ...titles],
                  next,
                  followed,
                  done,
                })
              }),
          },
        ),
        Effect.map((state) => state.titles),
      )
    }

    const operations = {
      getProject: () => get(`/api/projects/${segment}`, ProjectDetailSchema),

      listUsers: () =>
        Effect.map(get(`/api/projects/${segment}/users`, ProjectUsersResponseSchema), (data) => ({
          projectId: data.projectId,
          users: [
            ...data.users,
            ...data.memberSnapshots.flatMap((snapshot) =>
              Option.toArray(Option.fromNullable(snapshot.data)),
            ),
          ],
        })),

      listPages: (options = {}) => {
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
          `/api/pages/${segment}/${query === "" ? "" : `?${query}`}`,
          ListPagesResponseSchema,
        )
      },

      // followRename: 名前を変える前のタイトルで書いたリンクからも、今のページを引けるようにする。
      getPage: (title) =>
        pipe(
          get(
            `/api/pages/v2/${segment}/${encodeTitleForUrl(title)}/?followRename=true`,
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
                  infoboxDefinition: data.infoboxDefinition,
                  infoboxResult: data.infoboxResult,
                  infoboxDisableLinks: data.infoboxDisableLinks,
                  ...(data.user ? { user: data.user } : {}),
                  ...(data.users.length > 0 ? { users: data.users } : {}),
                  ...(data.lastUpdateUser ? { lastUpdateUser: data.lastUpdateUser } : {}),
                })
              : Option.none(),
          ),
          notFoundAsNone,
          Effect.map(Option.flatten),
        ),

      getPageText: (title) =>
        notFoundAsNone(requestText(`/api/pages/${segment}/${encodeTitleForUrl(title)}/text`)),

      getRelatedPages: (title) => {
        const base = relatedBaseOf(title)
        return Effect.map(
          Effect.all(
            [
              allOf(
                base,
                "links1hop",
                Links1HopResponseSchema,
                (response) => response.links1hop.length,
              ),
              allOf(
                base,
                "links2hop",
                Links2HopResponseSchema,
                (response) => response.links2hop.length,
              ),
            ],
            { concurrency: "unbounded" },
          ),
          ([hop1, hop2]) => {
            const links1hop = hop1.flatMap((response) => response.links1hop)
            const inFirstHop = new Set(
              links1hop.map((page) => page.titleLc).filter((lc) => lc !== ""),
            )
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
      },

      getInfobox: (pageId) =>
        get(`/api/pages/${segment}/${encodeURIComponent(pageId)}/infobox`, InfoboxSchema),

      exportForAi: (title, options = {}) => {
        // タイトルはクエリに入るので、encodeTitleForUrl (パス用) ではなく普通にエンコードする。
        const query = new URLSearchParams({ title })
        const filter = options.search?.trim() ?? ""
        if (filter !== "") query.append("search", filter)
        return requestText(
          `/api/smart-context/export-${options.hop ?? 1}hop-links/${segment}.txt?${query.toString()}`,
        )
      },

      searchFullText: (query) =>
        get(
          `/api/pages/${segment}/search/query?${new URLSearchParams({
            q: query,
            skip: "0",
            limit: String(FULL_TEXT_SEARCH_LIMIT),
            sort: "pageRank",
            // field=lines で本文を探す (無ければタイトルの検索になる)
            field: "lines",
          })}`,
          SearchFullTextResponseSchema,
        ),

      searchVector: (query) =>
        pipe(
          get(
            `/api/pages/${segment}/search/vector/titles?q=${encodeURIComponent(query)}`,
            SearchVectorResponseSchema,
          ),
          Effect.catchIf(
            (error) => error.status === VECTOR_SEARCH_DISABLED,
            () => Effect.succeed<VectorResult>({ pages: [] }),
          ),
        ),

      listTitles,

      listSnapshots: (pageId) =>
        Effect.map(
          get(
            `/api/page-snapshots/${segment}/${encodeURIComponent(pageId)}`,
            PageSnapshotsResponseSchema,
          ),
          (data) => data.timestamps.filter((entry) => entry.id !== ""),
        ),

      getSnapshot: (pageId, snapshotId) =>
        Effect.map(
          get(
            `/api/page-snapshots/${segment}/${encodeURIComponent(pageId)}/${encodeURIComponent(snapshotId)}`,
            PageSnapshotResponseSchema,
          ),
          (data) => data.snapshot,
        ),

      previewEdit: (body) =>
        Effect.flatMap(
          request(`/api/pages/v2/${segment}/page-edit-for-ai/preview`, { method: "POST", body }),
          decode(PreviewResponseSchema),
        ),

      submitEdit: (previewId) =>
        Effect.flatMap(
          request(`/api/pages/v2/${segment}/page-edit-for-ai/submit`, {
            method: "POST",
            body: { previewId },
          }),
          decode(SubmitResponseSchema),
        ),

      replaceLinks: (from, to) =>
        Effect.flatMap(
          request(`/api/pages/${segment}/replace/links`, { method: "POST", body: { from, to } }),
          decode(ReplaceLinksResponseSchema),
        ),

      // 未読かどうかの記録で、できなくても困ることはないので失敗にしない。POST を断られたら GET で記録する。
      markAccessed: (pageId) => {
        const path = `/api/pages/${segment}/${encodeURIComponent(pageId)}/accessed`
        return pipe(
          request(path, { method: "POST", body: {} }),
          Effect.orElse(() => request(path)),
          Effect.asVoid,
          Effect.orElse(() => Effect.void),
        )
      },

      disableInfoboxExtraction: (pageId, definitionTitle) =>
        setInfoboxExtraction(pageId, definitionTitle, "add"),

      enableInfoboxExtraction: (pageId, definitionTitle) =>
        setInfoboxExtraction(pageId, definitionTitle, "remove"),

      // 応答の本文は読み捨てる。Cosense Web も使わず、抜き出した値は読み直して知る。
      requestInfoboxExtraction: (pageId) =>
        pipe(
          requestRaw(`/api/pages/${segment}/${encodeURIComponent(pageId)}/infobox/update-result`, {
            method: "POST",
          }),
          Effect.flatMap((response) => bodyOf(response, "text", () => response.text())),
          Effect.asVoid,
        ),
    } satisfies Omit<
      CosenseProjectApi,
      "name" | "updatePage" | "createPage" | "getLiterateDatabase"
    >

    // Cosense Web と同じく、定義ページの今のタイトルで 1 hop を取り、リンクしているかを見る。
    const getLiterateDatabase: CosenseProjectApi["getLiterateDatabase"] = (title) =>
      Effect.flatMap(operations.getPage(title), (found) =>
        pipe(
          found,
          Option.filter((page) => page.infoboxDefinition.length > 0),
          Option.match({
            onNone: () => Effect.succeed(Option.none<LiterateDatabase>()),
            onSome: (page) =>
              Effect.map(links1hopOf(page.title), (links1hop) =>
                Option.some(literateDatabaseOf(page, links1hop)),
              ),
          }),
        ),
      )

    return {
      name,
      ...operations,
      updatePage: updatePageWith(operations),
      createPage: createPageWith(operations),
      getLiterateDatabase,
    }
  }

  return {
    getMe: () => get("/api/users/me", MeSchema),
    listProjects: () =>
      Effect.map(get("/api/projects", ProjectsResponseSchema), (data) => data.projects),
    fetchAsset,
    project,
  }
}
