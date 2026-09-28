/**
 * title.ts — ページタイトルとファイルパスの扱い。
 */

/**
 * タイトルの突き合わせに使う形。Cosense は大文字小文字を区別せず、
 * 空白と `_` を同じ文字として扱う (URL では空白が `_` になるため)。
 */
export const normalizeTitle = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "_")

/**
 * タイトルから URL の 1 段ぶんの文字列を作る。Cosense の URL と同じく空白は `_` にする。
 * `/` `?` `#` は URL の区切りとして解釈されてしまうので `-` に置き換える。
 */
export const titleToSlug = (title: string): string =>
  title.trim().replace(/\s+/g, "_").replace(/[/?#]/g, "-")

/**
 * 同じページを指すタイトルの重複を除く。大文字小文字や空白と `_` の違いだけなら同じページなので、
 * 最初に出てきた書き方を残す。空のタイトルも除く。
 */
export const uniqueTitles = (titles: readonly string[]): string[] => {
  const keys = titles.map(normalizeTitle)
  return titles.filter((_, i) => {
    const key = keys[i] ?? ""
    return key !== "" && keys.indexOf(key) === i
  })
}
