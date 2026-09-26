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

/** `[./foo.csn]` のように、ファイルを相対パスで指すリンクか。 */
export const isRelativePath = (target: string): boolean =>
  target.startsWith("./") || target.startsWith("../")

/**
 * `from` のファイルから見た相対パス `relative` を、`from` と同じ基点のパスにする。
 *
 * `node:path` を使わないのは、ブラウザや Workers でもコンパイルできるようにするため。
 */
export const resolveRelativePath = (from: string, relative: string): string => {
  // 基点は `from` のファイルがあるディレクトリ。
  const directory = from
    .split("/")
    .filter((segment) => segment !== "")
    .slice(0, -1)
  return (from.startsWith("/") ? "/" : "") + walk(directory, relative.split("/")).join("/")
}

/** `resolved` から `segments` を 1 段ずつ辿る。`..` で 1 段上がり、`.` と空の段は読み飛ばす。 */
const walk = (resolved: readonly string[], segments: readonly string[]): readonly string[] => {
  const [segment, ...rest] = segments
  if (segment === undefined) return resolved
  if (segment === "" || segment === ".") return walk(resolved, rest)
  return walk(segment === ".." ? resolved.slice(0, -1) : [...resolved, segment], rest)
}
