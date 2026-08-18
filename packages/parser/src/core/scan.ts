/**
 * scan.ts — 記法の知識を持たない文字列走査のプリミティブ。
 */
import { Option } from 'effect'

/** 行頭の空白 (半角スペース / タブ / 全角スペース)。インデント判定の単一ソース。 */
const LEADING_WHITESPACE_RE = /^[ \t　]*/

export const leadingWhitespace = (s: string): string => LEADING_WHITESPACE_RE.exec(s)?.[0] ?? ''

/**
 * `openIdx` の `[` に対応する `]` の位置。深さを数えるので
 * `[* a [b] c]` のような入れ子でも外側の `]` を返す。対応が閉じなければ None。
 */
export const findClosingBracket = (s: string, openIdx: number): Option.Option<number> => {
  let depth = 0
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return Option.some(i)
    }
  }
  return Option.none()
}

/** `#` がタグの開始位置か (行頭、または直前が空白)。単語の途中の `#` を除くため。 */
export const isTagBoundary = (s: string, index: number): boolean => {
  if (index === 0) return true
  const prev = s[index - 1]
  return prev === ' ' || prev === '\t' || prev === '　'
}
