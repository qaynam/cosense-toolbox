/**
 * position.ts — 位置情報の組み立て。
 *
 * インラインの走査は「1 行の中の部分文字列」を対象にするため、走査対象の先頭が
 * ソース上のどこかを表す Origin を持ち回り、そこからの相対インデックスで位置を作る。
 * 位置計算をここ 1 箇所に集約することで、装飾の中の再帰でオフセットがずれる事故を防ぐ。
 */
import type { Point, Position } from '../types'

/** 走査対象の文字列のインデックス 0 が、ソース上のどこにあるか。 */
export interface Origin {
  readonly line: number
  readonly column: number
  readonly offset: number
}

export const originOfLine = (line: number, offset: number): Origin => ({ line, column: 0, offset })

/** Origin を `by` 文字ぶん進める (部分文字列を再帰的に走査するときに使う)。 */
export const shiftOrigin = (origin: Origin, by: number): Origin => ({
  line: origin.line,
  column: origin.column + by,
  offset: origin.offset + by,
})

export const pointAt = (origin: Origin, index: number): Point => ({
  line: origin.line,
  column: origin.column + index,
  offset: origin.offset + index,
})

/** 走査対象の `[start, end)` が占める Position。end は exclusive。 */
export const spanAt = (origin: Origin, start: number, end: number): Position => ({
  start: pointAt(origin, start),
  end: pointAt(origin, end),
})
