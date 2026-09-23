/**
 * `@cosense-toolbox/cosense-x/fetch` — 公開プロジェクトのページを Cosense の API から取ってくる。
 *
 * `fetch` を使うのはこのサブパスだけにして、コンパイラ本体は外と通信しないままにしておく。
 * 非公開プロジェクト (トークンが要るもの) はここでは扱わない。
 */

const API_ORIGIN = 'https://scrapbox.io'

export interface FetchOptions {
  /** 差し替え用。テストや、キャッシュを挟みたいときに渡す */
  readonly fetch?: typeof globalThis.fetch
  /** API の origin。 @defaultValue `https://scrapbox.io` */
  readonly origin?: string
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

const request = async (url: string, options: FetchOptions): Promise<Response> => {
  const response = await (options.fetch ?? globalThis.fetch)(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
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
    text: page.lines.map((line) => line.text).join('\n'),
    created: isoOf(page.created),
    updated: isoOf(page.updated),
  }
}
