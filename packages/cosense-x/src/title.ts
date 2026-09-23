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
    .replace(/[\s_]+/g, '_')

/**
 * タイトルから URL の 1 段ぶんの文字列を作る。Cosense の URL と同じく空白は `_` にする。
 * `/` `?` `#` は URL の区切りとして解釈されてしまうので `-` に置き換える。
 */
export const titleToSlug = (title: string): string =>
  title.trim().replace(/\s+/g, '_').replace(/[/?#]/g, '-')

/** `[./foo.csn]` のように、ファイルを相対パスで指すリンクか。 */
export const isRelativePath = (target: string): boolean =>
  target.startsWith('./') || target.startsWith('../')

/**
 * `from` のファイルから見た相対パス `relative` を、`from` と同じ基点のパスにする。
 *
 * `node:path` を使わないのは、ブラウザや Workers でもコンパイルできるようにするため。
 */
export const resolveRelativePath = (from: string, relative: string): string => {
  const absolute = from.startsWith('/')
  const segments = from.split('/').filter((segment) => segment !== '')
  segments.pop()
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return (absolute ? '/' : '') + segments.join('/')
}
