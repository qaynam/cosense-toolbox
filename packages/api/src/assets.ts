/**
 * Cosense 上のファイル (アップロードしたファイル `/files/…` とアイコン `/api/pages/…/icon`) の URL。
 * 通信しないので、`createCosenseApi` を作らずに使える。中身は `createCosenseApi().fetchAsset` で取る。
 */
import { type CosenseApiOptions, originOf } from "./options"

/**
 * `origin` にアップロードしたファイル (`/files/…`) か、アイコン (`/api/pages/…/icon`) の URL か。
 *
 * @throws TypeError - `origin` が http(s) の origin でないとき
 */
export const isCosenseAssetUrl = (
  url: string,
  options: Pick<CosenseApiOptions, "origin"> = {},
): boolean => {
  const origin = originOf(options.origin)
  if (!url.startsWith(`${origin}/`)) return false
  const path = url.slice(origin.length)
  return path.startsWith("/files/") || (path.startsWith("/api/pages/") && path.endsWith("/icon"))
}

/**
 * `[user.icon]` の画像の URL (`/api/pages/:project/:user/icon`)。parser の `toHtml` などの `iconImageUrl` に使う。
 * `[/project/user.icon]` のように別のプロジェクトを指すときは、`user` に `/project/user` が入る。
 *
 * @throws TypeError - `origin` が http(s) の origin でないとき
 */
export const cosenseIconUrl = (
  project: string,
  user: string,
  options: Pick<CosenseApiOptions, "origin"> = {},
): string => {
  const path = user.startsWith("/")
    ? user.split("/").map(encodeURIComponent).join("/")
    : `/${encodeURIComponent(project)}/${encodeURIComponent(user)}`
  return `${originOf(options.origin)}/api/pages${path}/icon`
}
