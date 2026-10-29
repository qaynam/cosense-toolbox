/**
 * page-url.ts — `pageUrl` を渡さなかったときのリンク先。
 *
 * `{srcDir}/pages` の下のページは、Astro がファイルの場所から決めた URL で配信する。
 * それ以外 (content collection など) の URL は利用者のルーティングで決まり、ここからは分からないので、
 * cosense-x の既定の `/{slug}` にする。どちらもサイトの `base` の下に置く。
 */
import { fileURLToPath } from "node:url"

import { defaultPageUrl, type LinkTarget } from "@cosense-toolbox/cosense-x"
import type { AstroConfig } from "astro"
import { Option, pipe } from "effect"

import { idOf } from "./site"

type PageUrlConfig = Pick<AstroConfig, "root" | "srcDir" | "base" | "trailingSlash" | "build">

/**
 * URL の末尾に `/` を付けるか。Astro が `Astro.url` やビルドしたページの一覧 (sitemap が読む) を
 * 作るときの規則 (`shouldAppendForwardSlash`) と同じにする。Astro はこれを公開していないので写している。
 */
const appendsSlash = ({ trailingSlash, build }: PageUrlConfig): boolean =>
  trailingSlash === "always" || (trailingSlash === "ignore" && build.format === "directory")

/** pages の下のパスから、URL の段を作る。Astro のルーティングと同じく、拡張子と末尾の `index` を落とす。 */
const routeSegmentsOf = (pathInPages: string): string[] => {
  const segments = pathInPages.replace(/\.csnx?$/, "").split("/")
  return segments[segments.length - 1] === "index" ? segments.slice(0, -1) : segments
}

export const defaultPageUrlFor = (config: PageUrlConfig): ((page: LinkTarget) => string) => {
  const base = config.base.replace(/\/$/, "")
  const pagesDir = fileURLToPath(new URL("pages/", config.srcDir))
  const pagesPrefix = `${idOf(fileURLToPath(config.root), pagesDir)}/`
  const slash = appendsSlash(config) ? "/" : ""

  const routeUrl = (pathInPages: string): string => {
    const path = [base, ...routeSegmentsOf(pathInPages).map(encodeURIComponent)].join("/")
    return path === "" ? "/" : `${path}${slash}`
  }

  return (page) =>
    pipe(
      Option.fromNullable(page.id),
      Option.filter((id) => id.startsWith(pagesPrefix)),
      Option.match({
        onNone: () => `${base}${defaultPageUrl(page)}`,
        onSome: (id) => routeUrl(id.slice(pagesPrefix.length)),
      }),
    )
}
