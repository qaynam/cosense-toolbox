/**
 * `@cosense-toolbox/cosense-x/fetch` — Cosense の API からページや画像を取ってくる。
 *
 * `fetch` を使うのはこのサブパスだけにして、コンパイラ本体は外と通信しないままにしておく。
 * 非公開プロジェクトは `pat` (Personal Access Token) を渡すと読める。
 */

const API_ORIGIN = "https://scrapbox.io"

export interface FetchOptions {
  /** 差し替え用。テストや、キャッシュを挟みたいときに渡す */
  readonly fetch?: typeof globalThis.fetch
  /** API の origin。 @defaultValue `https://scrapbox.io` */
  readonly origin?: string
  /** Cosense の Personal Access Token。非公開プロジェクトを読むときに渡す。Cosense 以外には送らない */
  readonly pat?: string
}

export interface FetchedPage {
  readonly title: string
  /** ページ本文。1 行目がタイトル */
  readonly text: string
  /** 作成日時 (ISO 8601) */
  readonly created: string
  /** 更新日時 (ISO 8601) */
  readonly updated: string
}

const pageUrl = (project: string, title: string, origin: string): string =>
  `${origin}/api/pages/${encodeURIComponent(project)}/${encodeURIComponent(title)}`

/** Cosense の API に送るヘッダ。PAT はここでだけ付ける。 */
const headersFor = (options: FetchOptions): Record<string, string> =>
  options.pat === undefined ? {} : { "x-personal-access-token": options.pat }

const request = async (url: string, options: FetchOptions): Promise<Response> => {
  const response = await (options.fetch ?? globalThis.fetch)(url, {
    headers: headersFor(options),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Cosense のページを取得できない: ${response.status} ${url}\n${body}`)
  }
  return response
}

/** ページ本文をそのまま取る (`/api/pages/:project/:title/text`)。 */
export const fetchPageText = async (
  project: string,
  title: string,
  options: FetchOptions = {},
): Promise<string> => {
  const url = `${pageUrl(project, title, options.origin ?? API_ORIGIN)}/text`
  return (await request(url, options)).text()
}

interface PageResponse {
  readonly title: string
  readonly created: number
  readonly updated: number
  readonly lines: readonly { readonly text: string }[]
}

/** Cosense の API は日時を秒で返す。 */
const isoOf = (seconds: number): string => new Date(seconds * 1000).toISOString()

/**
 * ページを取り、本文と作成・更新日時を返す (`/api/pages/:project/:title`)。
 * 投稿日を frontmatter に入れたいときに使う。
 */
export const fetchPage = async (
  project: string,
  title: string,
  options: FetchOptions = {},
): Promise<FetchedPage> => {
  const url = pageUrl(project, title, options.origin ?? API_ORIGIN)
  const page = (await (await request(url, options)).json()) as PageResponse
  return {
    title: page.title,
    text: page.lines.map((line) => line.text).join("\n"),
    created: isoOf(page.created),
    updated: isoOf(page.updated),
  }
}

/**
 * Cosense 上にあるファイルの URL か。アップロードしたファイル (`/files/…`) とアイコン (`/api/pages/…/icon`)。
 *
 * これらは `Cross-Origin-Resource-Policy: same-origin` を返すので、別のサイトの `<img>` からは読めない。
 * リダイレクト先の URL も期限付き (`/files/` は 5 分) なので、静的なサイトには中身を取ってきて置く必要がある。
 */
export const isCosenseAssetUrl = (
  url: string,
  options: Pick<FetchOptions, "origin"> = {},
): boolean => {
  const origin = options.origin ?? API_ORIGIN
  if (!url.startsWith(`${origin}/`)) return false
  const path = url.slice(origin.length)
  return path.startsWith("/files/") || (path.startsWith("/api/pages/") && path.endsWith("/icon"))
}

/**
 * `[user.icon]` の画像の URL (`/api/pages/:project/:user/icon`)。`toHtml` などの `iconImageUrl` に使う。
 * `[/project/user.icon]` のように別のプロジェクトを指すときは、`user` に `/project/user` が入る。
 */
export const cosenseIconUrl = (
  project: string,
  user: string,
  options: Pick<FetchOptions, "origin"> = {},
): string => {
  const path = user.startsWith("/")
    ? user.split("/").map(encodeURIComponent).join("/")
    : `/${encodeURIComponent(project)}/${encodeURIComponent(user)}`
  return `${options.origin ?? API_ORIGIN}/api/pages${path}/icon`
}

export interface FetchedAsset {
  readonly data: Uint8Array
  /** `Content-Type` ヘッダの値。無ければ空文字 */
  readonly contentType: string
}

const MAX_REDIRECTS = 5

/**
 * ファイルの中身を取ってくる。Cosense のファイルは別の場所 (Google Cloud Storage や Gyazo) に
 * リダイレクトされるので辿る。
 *
 * リダイレクトは自分で辿る。`fetch` に任せると、PAT のような独自ヘッダを付けたまま
 * 別のオリジンにも送ってしまうため。PAT は Cosense (`origin`) への要求にだけ付ける。
 */
export const fetchAsset = (url: string, options: FetchOptions = {}): Promise<FetchedAsset> => {
  const origin = new URL(options.origin ?? API_ORIGIN).origin
  const fetch = options.fetch ?? globalThis.fetch

  const follow = async (current: string, redirects: number): Promise<FetchedAsset> => {
    if (redirects > MAX_REDIRECTS) {
      throw new Error(
        `Cosense のファイルを取得できない: リダイレクトが ${MAX_REDIRECTS} 回を超えた ${url}`,
      )
    }
    const response = await fetch(current, {
      redirect: "manual",
      headers: new URL(current).origin === origin ? headersFor(options) : {},
    })
    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location !== null) {
      return follow(new URL(location, current).href, redirects + 1)
    }
    if (!response.ok) {
      throw new Error(`Cosense のファイルを取得できない: ${response.status} ${url}`)
    }
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "",
    }
  }

  return follow(url, 0)
}
