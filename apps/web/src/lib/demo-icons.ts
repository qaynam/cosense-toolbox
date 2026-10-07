import { parse } from "@cosense-toolbox/parser"
import { toHtml } from "@cosense-toolbox/parser/html"
import { collect } from "@cosense-toolbox/parser/utils"
import style from "@cosense-toolbox/style/style.css?raw"

const project = "help-jp"

const source = [
  "リンクとアイコン",
  " 同じプロジェクトのページ",
  "  [ブラケティング]",
  "  #HashTag",
  " 別のプロジェクトのページ",
  "  [/icons/すごい]",
  " アイコン",
  "  [/qaynam/qaynam.icon]",
  "  [/Icons2/trainSymbol-M.icon]",
].join("\n")

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/")

/** `/project/page` はそのまま、`page` は `project` のページとして、Cosense のパスにする。 */
const pagePath = (title: string) =>
  title.startsWith("/")
    ? encodePath(title)
    : `/${encodeURIComponent(project)}/${encodeURIComponent(title)}`

/**
 * アイコンの画像を取ってきて、`data:` URL にする。取れなければ null (ユーザー名のリンクになる)。
 *
 * API の URL を `<img>` にそのまま入れることはできない。API は `Cross-Origin-Resource-Policy: same-origin`
 * を返すので、ほかのサイトからは読めない。転送先の URL も、期限付き (数分で切れる) のことがある。
 */
async function fetchIconDataUrl(user: string): Promise<string | null> {
  try {
    const res = await fetch(`https://scrapbox.io/api/pages${pagePath(user)}/icon`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const type = res.headers.get("content-type") ?? "image/png"
    const bytes = Buffer.from(await res.arrayBuffer()).toString("base64")
    return `data:${type};base64,${bytes}`
  } catch {
    return null
  }
}

const page = parse(source)

const iconByUser = new Map(
  await Promise.all(
    collect(page, "icon").map(
      async (icon) => [icon.user, await fetchIconDataUrl(icon.user)] as const,
    ),
  ),
)

const body = toHtml(page, {
  pageUrl: (title) => `https://scrapbox.io${pagePath(title)}`,
  iconImageUrl: (icon) => iconByUser.get(icon.user) ?? null,
})

export const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>${style}</style>
  </head>
  <body>
    ${body}
  </body>
</html>`
