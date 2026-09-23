/**
 * ページの URL。astro.config.mjs のリンク解決と、逆リンクなどの一覧で同じ規則を使う。
 *
 * 記事は /posts/{slug}/、src/pages に置いたページはファイルの場所で決まる。
 */
export const pageUrl = (page: { readonly id: string | null; readonly slug: string }): string => {
  if (page.id?.startsWith('src/pages/')) {
    return `/${page.id.replace(/^src\/pages\//, '').replace(/(?:\/?index)?\.csnx?$/, '')}/`
  }
  return `/posts/${encodeURIComponent(page.slug)}/`
}

export const tagUrl = (tag: string): string => `/tags/${encodeURIComponent(tag)}/`
