/**
 * ページの行の差分。今の行 (id 付き) と書き換えた後の文から、ページを書き換える API
 * (`previewEdit`) に渡す変更を作る。
 */
import type { RawChange } from "./types"

/** 元の行。`getPage` の `lines` をそのまま渡せる。 */
export interface BaseLine {
  readonly id: string
  readonly text: string
}

type Op =
  | { readonly kind: "match"; readonly baseIndex: number; readonly nextIndex: number }
  | { readonly kind: "del"; readonly baseIndex: number }
  | { readonly kind: "ins"; readonly nextIndex: number }

// 行の文で取る LCS の差分。dp[i][j] は base[i..] と next[j..] の LCS の長さ。
const buildOps = (base: readonly BaseLine[], next: readonly string[]): Op[] => {
  const n = base.length
  const m = next.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i] as number[]
    const nextRow = dp[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        base[i]?.text === next[j]
          ? (nextRow[j + 1] as number) + 1
          : Math.max(nextRow[j] as number, row[j + 1] as number)
    }
  }

  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (base[i]?.text === next[j]) {
      ops.push({ kind: "match", baseIndex: i, nextIndex: j })
      i++
      j++
    } else if (((dp[i + 1] as number[])[j] as number) >= ((dp[i] as number[])[j + 1] as number)) {
      ops.push({ kind: "del", baseIndex: i })
      i++
    } else {
      ops.push({ kind: "ins", nextIndex: j })
      j++
    }
  }
  while (i < n) {
    ops.push({ kind: "del", baseIndex: i })
    i++
  }
  while (j < m) {
    ops.push({ kind: "ins", nextIndex: j })
    j++
  }
  return ops
}

/** 書き換えなかった元の行。文も id もそのまま。 */
export interface KeptSegment {
  readonly kind: "keep"
  readonly line: BaseLine
}

/**
 * 残った 2 つの行のあいだで変わったところ。消した行と足した行を前から組にして `updates`
 * (同じ id で文だけ変える) にし、余った分を本当の削除か追加にする。
 */
export interface ChangedSegment {
  readonly kind: "change"
  readonly updates: readonly { readonly line: BaseLine; readonly text: string }[]
  readonly deletes: readonly BaseLine[]
  readonly inserts: readonly string[]
  /** 足す行を前に入れる元の行の id。末尾に続くときは `"_end"` */
  readonly anchor: string
}

export type EditSegment = KeptSegment | ChangedSegment

/**
 * `base` を `next` にする変更を、元の行の順に並べたもの。行の対応は {@link computeChanges} が
 * 作る変更と同じになる。
 *
 * LCS で同じ長さの道がいくつもあるときは、いつも元の側を先に進める (削除を先にする) ので、
 * 同じ `base` と `next` からは、いつも同じ結果になる。
 */
export const buildSegments = (
  base: readonly BaseLine[],
  next: readonly string[],
): readonly EditSegment[] => {
  const ops = buildOps(base, next)
  const segments: EditSegment[] = []
  let idx = 0

  while (idx < ops.length) {
    const op = ops[idx] as Op
    if (op.kind === "match") {
      segments.push({ kind: "keep", line: base[op.baseIndex] as BaseLine })
      idx++
      continue
    }

    const dels: BaseLine[] = []
    const inserts: string[] = []
    while (idx < ops.length) {
      const current = ops[idx] as Op
      if (current.kind === "del") {
        dels.push(base[current.baseIndex] as BaseLine)
        idx++
      } else if (current.kind === "ins") {
        inserts.push(next[current.nextIndex] as string)
        idx++
      } else {
        break
      }
    }

    let anchor = "_end"
    for (let k = idx; k < ops.length; k++) {
      const candidate = ops[k] as Op
      if (candidate.kind === "match") {
        anchor = (base[candidate.baseIndex] as BaseLine).id
        break
      }
    }

    const pairCount = Math.min(dels.length, inserts.length)
    segments.push({
      kind: "change",
      updates: dels.slice(0, pairCount).map((line, k) => ({ line, text: inserts[k] as string })),
      deletes: dels.slice(pairCount),
      inserts: inserts.slice(pairCount),
      anchor,
    })
  }

  return segments
}

/**
 * `next` の各行が、元のどの行をそのまま残したものか。新しく足した行や書き換えた行は `undefined`。
 *
 * 書き換えた行も `undefined` にするのは、元の行に付いていたこと (書いた人や日時) が、
 * 今の文にはもう当てはまらないため。
 */
export const alignLines = <T extends BaseLine>(
  base: readonly T[],
  next: readonly string[],
): readonly (T | undefined)[] => {
  const aligned = new Array<T | undefined>(next.length).fill(undefined)
  for (const op of buildOps(base, next)) {
    if (op.kind === "match") aligned[op.nextIndex] = base[op.baseIndex]
  }
  return aligned
}

/** 新しい行の id。小文字の 16 進数 24 文字で、Cosense の行の id と同じ形。 */
export const createLineId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

/**
 * `base` (今の行) を `next` (書き換えた後の行の文) にする変更。`previewEdit` の `changes` に渡す。
 *
 * @param newLineId - 足す行の id を作る関数。省略すると {@link createLineId}。
 */
export const computeChanges = (
  base: readonly BaseLine[],
  next: readonly string[],
  newLineId: () => string = createLineId,
): readonly RawChange[] =>
  buildSegments(base, next).flatMap((segment): RawChange[] =>
    segment.kind === "keep"
      ? []
      : [
          ...segment.updates.map(({ line, text }) => ({ _update: line.id, lines: { text } })),
          ...segment.deletes.map((line) => ({ _delete: line.id })),
          ...segment.inserts.map((text) => ({
            _insert: segment.anchor,
            lines: { id: newLineId(), text },
          })),
        ],
  )
