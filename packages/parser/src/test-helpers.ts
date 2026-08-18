/**
 * test-helpers.ts — テスト専用ユーティリティ (dist には含まれない)。
 *
 * 位置情報を全ケースに手書きすると、記法を 1 つ足すたびに無関係なテストが壊れる。
 * 構造の検証は `stripPositions` で位置を落として行い、位置の正しさは
 * 代表ケース (`at`) とプロパティテストで別に保証する。
 */
import type { Position } from './types'

export type Positionless<T> = T extends readonly (infer U)[]
  ? Positionless<U>[]
  : T extends object
    ? { [K in Exclude<keyof T, 'position'>]: Positionless<T[K]> }
    : T

/** ノード (または配列) から `position` を再帰的に取り除く。 */
export function stripPositions<T>(value: T): Positionless<T> {
  if (Array.isArray(value)) {
    return value.map(stripPositions) as Positionless<T>
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      if (key === 'position') continue
      out[key] = stripPositions(v)
    }
    return out as Positionless<T>
  }
  return value as Positionless<T>
}

/**
 * `source` 中の `needle` (occurrence 番目、0 始まり) が占める Position を組み立てる。
 * 期待値を手で数えずに書くためのヘルパー。needle が改行を跨がない前提。
 */
export function at(source: string, needle: string, occurrence = 0): Position {
  let offset = -1
  for (let n = 0; n <= occurrence; n++) {
    offset = source.indexOf(needle, offset + 1)
    if (offset < 0) throw new Error(`needle not found: ${JSON.stringify(needle)} (#${occurrence})`)
  }
  const before = source.slice(0, offset)
  const line = before.split('\n').length - 1
  const column = offset - (before.lastIndexOf('\n') + 1)
  return {
    start: { line, column, offset },
    end: { line, column: column + needle.length, offset: offset + needle.length },
  }
}
