/**
 * Cosense 上のファイル (アップロードしたファイル `/files/…` とアイコン `/api/pages/…/icon`) の URL。
 * 通信しないので、`createCosenseApi` を作らずに使える。中身は `createCosenseApi().fetchAsset` で取る。
 */
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
