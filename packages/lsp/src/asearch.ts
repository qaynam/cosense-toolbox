import { Array as Arr } from "effect"

/**
 * Approximate string matching (Asearch, a bit-parallel Shift-And), the algorithm Cosense's
 * own search uses to find titles a typo away.
 *
 * `Asearch(pattern)(text, ambig)` is true when `pattern` matches the *whole* of `text` with
 * at most `ambig` edits (insertions, deletions, substitutions), up to 3. A half-width space
 * in the pattern matches anything there, including nothing, so `" side "` finds `side`
 * anywhere in a title. ASCII letters match either case.
 *
 * The pattern is held in one 32-bit word, so only its first 31 characters count.
 */
export type AsearchMatch = (text: string, ambig?: number) => boolean

type State = readonly [number, number, number, number]

const FIRST = 0x80000000
const INITIAL: State = [FIRST, 0, 0, 0]
const MAX_AMBIG = INITIAL.length - 1

/** UTF-16 code units: the unit the bit table is keyed by. */
const codesOf = (text: string): ReadonlyArray<number> =>
  Arr.map(text.split(""), (char) => char.charCodeAt(0))

/** The code itself and, for an ASCII letter, its other case. */
const casesOf = (code: number): ReadonlyArray<number> =>
  code >= 0x41 && code <= 0x5a
    ? [code, code + 0x20]
    : code >= 0x61 && code <= 0x7a
      ? [code, code - 0x20]
      : [code]

interface Pattern {
  /** For each character, the bits of the pattern positions it stands at. */
  readonly bits: ReadonlyMap<number, number>
  /** The positions a space stands at, which any character passes. */
  readonly epsilon: number
  /** The bit one past the last position: reaching it is a match. */
  readonly accept: number
}

const compile = (source: string): Pattern =>
  Arr.reduce(
    codesOf(source),
    { bits: new Map<number, number>(), epsilon: 0, accept: FIRST },
    ({ bits, epsilon, accept }, code): Pattern =>
      code === 0x20
        ? { bits, epsilon: epsilon | accept, accept }
        : {
            bits: Arr.reduce(casesOf(code), new Map(bits), (next, each) =>
              next.set(each, (next.get(each) ?? 0) | accept),
            ),
            epsilon,
            accept: accept >>> 1,
          },
  )

/** One character read: each row allows one more edit than the row before. */
const step =
  ({ bits, epsilon }: Pattern) =>
  ([s0, s1, s2, s3]: State, code: number): State => {
    const hit = bits.get(code) ?? 0
    const advance = (row: number) => (row & epsilon) | ((row & hit) >>> 1)
    const n0 = advance(s0)
    const n1 = advance(s1) | (s0 >>> 1) | s0 | (n0 >>> 1)
    const n2 = advance(s2) | (s1 >>> 1) | s1 | (n1 >>> 1)
    const n3 = advance(s3) | (s2 >>> 1) | s2 | (n2 >>> 1)
    return [n0, n1, n2, n3]
  }

export const Asearch = (source: string): AsearchMatch => {
  const pattern = compile(source)
  return (text, ambig = 0) => {
    const state = Arr.reduce(codesOf(text), INITIAL, step(pattern))
    return ((state[Math.max(0, Math.min(ambig, MAX_AMBIG))] ?? 0) & pattern.accept) !== 0
  }
}
