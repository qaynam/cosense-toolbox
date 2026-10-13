/**
 * Cosense 上のファイル (アップロードしたファイル `/files/…` とアイコン `/api/pages/…/icon`) を扱う。
 *
 * これらは `Cross-Origin-Resource-Policy: same-origin` を返すので、別のサイトの `<img>` からは読めない。
 * リダイレクト先の URL も期限付き (`/files/` は 5 分) なので、静的なサイトには中身を取ってきて置く必要がある。
 */
import { CosenseApiError } from "./errors"
import { type CosenseApiOptions, DEFAULT_ORIGIN } from "./options"

/** Cosense 上のファイルの URL か。 */
export const isCosenseAssetUrl = (
  url: string,
  options: Pick<CosenseApiOptions, "origin"> = {},
): boolean => {
  const origin = options.origin ?? DEFAULT_ORIGIN
  if (!url.startsWith(`${origin}/`)) return false
  const path = url.slice(origin.length)
  return path.startsWith("/files/") || (path.startsWith("/api/pages/") && path.endsWith("/icon"))
}

/**
 * `[user.icon]` の画像の URL (`/api/pages/:project/:user/icon`)。parser の `toHtml` などの `iconImageUrl` に使う。
 * `[/project/user.icon]` のように別のプロジェクトを指すときは、`user` に `/project/user` が入る。
 */
export const cosenseIconUrl = (
  project: string,
  user: string,
  options: Pick<CosenseApiOptions, "origin"> = {},
): string => {
  const path = user.startsWith("/")
    ? user.split("/").map(encodeURIComponent).join("/")
    : `/${encodeURIComponent(project)}/${encodeURIComponent(user)}`
  return `${options.origin ?? DEFAULT_ORIGIN}/api/pages${path}/icon`
}

export interface FetchedAsset {
  readonly data: Uint8Array
  /** `Content-Type` ヘッダの値。無ければ空文字 */
  readonly contentType: string
}

const MAX_REDIRECTS = 5

/**
 * ファイルの中身を取ってくる。Cosense のファイルは別の場所 (Google Cloud Storage や Gyazo) に
 * リダイレクトされるので辿る。取れなければ `CosenseApiError` で reject する。
 *
 * リダイレクトは自分で辿る。`fetch` に任せると、PAT のような独自ヘッダを付けたまま
 * 別のオリジンにも送ってしまうため。PAT は Cosense (`origin`) への要求にだけ付ける。
 */
export const fetchAsset = (url: string, options: CosenseApiOptions = {}): Promise<FetchedAsset> => {
  const origin = new URL(options.origin ?? DEFAULT_ORIGIN).origin
  const fetch = options.fetch ?? globalThis.fetch
  const headersFor = (target: string): Record<string, string> =>
    new URL(target).origin === origin && options.pat !== undefined
      ? { "x-personal-access-token": options.pat }
      : {}

  const follow = async (current: string, redirects: number): Promise<FetchedAsset> => {
    const response = await fetch(current, { redirect: "manual", headers: headersFor(current) })
    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location !== null) {
      if (redirects >= MAX_REDIRECTS) {
        throw new CosenseApiError({
          status: response.status,
          message: `Cosense のファイルを取得できない: リダイレクトが ${MAX_REDIRECTS} 回を超えた ${url}`,
        })
      }
      return follow(new URL(location, current).href, redirects + 1)
    }
    if (!response.ok) {
      throw new CosenseApiError({
        status: response.status,
        message: `Cosense のファイルを取得できない: ${response.status} ${url}`,
      })
    }
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "",
    }
  }

  return follow(url, 0)
}
