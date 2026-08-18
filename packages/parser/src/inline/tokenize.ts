/**
 * tokenize.ts — 行内の走査ループ。
 *
 * 1 文字ずつ進みながら construct を順に試し、成立したらノードにする。どれも成立しなければ
 * その 1 文字はテキストとして貯めておき、次にノードが出たところ (と末尾) でまとめて
 * text ノードにする。位置の付与はこのループだけが行う。
 */
import { Option } from 'effect'
import { type Origin, spanAt } from '../core/position'
import type { InlineNode, InlineNodeInit, Position } from '../types'
import { inlineConstructs } from './constructs'
import type {
  BracketRule,
  ConstructMatch,
  Extension,
  InlineConstruct,
  InlineContext,
} from './types'

export interface TokenizeInlineOptions {
  /** 装飾記法を解釈するか (既定: true)。装飾の中身を解析するときだけ false になる */
  readonly allowDecoration?: boolean
  /** この文字列がページ上のどこにあるか。省略時は 0 行目の先頭 */
  readonly origin?: {
    readonly line?: number
    readonly column?: number
    readonly offset?: number
  }
  /** 記法の拡張。既定のルールより先に試される */
  readonly extensions?: readonly Extension[]
}

/** 走査に渡せる形まで並べ終えたルール。`constructs` は先頭から順に試される。 */
export interface ResolvedExtensions {
  readonly constructs: readonly InlineConstruct[]
  readonly bracketRules: readonly BracketRule[]
}

/** 拡張のルールを既定のルールの前に並べる。拡張が既定の記法を上書きできるのはこの順序による。 */
export const resolveExtensions = (extensions?: readonly Extension[]): ResolvedExtensions => {
  if (extensions === undefined || extensions.length === 0) {
    return { constructs: inlineConstructs, bracketRules: [] }
  }
  const constructs: InlineConstruct[] = []
  const bracketRules: BracketRule[] = []
  for (const extension of extensions) {
    if (extension.constructs) constructs.push(...extension.constructs)
    if (extension.bracketRules) bracketRules.push(...extension.bracketRules)
  }
  return { constructs: [...constructs, ...inlineConstructs], bracketRules }
}

/**
 * ノード本体に位置を与える。判別共用体へのスプレッドは TS が型を保てないため
 * ここだけキャストする (position 以外のフィールドは触っていない)。
 */
const withPosition = (node: InlineNodeInit, position: Position): InlineNode =>
  ({ ...node, position }) as InlineNode

/** ジェネレータにしているのは、最初に成立した時点で残りのルールを評価しないため。 */
function* attempts(
  constructs: readonly InlineConstruct[],
  source: string,
  index: number,
  ctx: InlineContext,
) {
  for (const construct of constructs) yield construct(source, index, ctx)
}

const firstMatch = (
  constructs: readonly InlineConstruct[],
  source: string,
  index: number,
  ctx: InlineContext,
): Option.Option<ConstructMatch> => Option.firstSomeOf(attempts(constructs, source, index, ctx))

const scan = (
  source: string,
  origin: Origin,
  allowDecoration: boolean,
  rules: ResolvedExtensions,
): readonly InlineNode[] => {
  const out: InlineNode[] = []
  const ctx: InlineContext = {
    allowDecoration,
    origin,
    bracketRules: rules.bracketRules,
    tokenize: (inner, innerOrigin, innerAllowDecoration) =>
      scan(inner, innerOrigin, innerAllowDecoration, rules),
  }

  let textStart = 0
  let index = 0

  const flushText = (end: number) => {
    if (end <= textStart) return
    out.push({
      type: 'text',
      value: source.slice(textStart, end),
      position: spanAt(origin, textStart, end),
    })
  }

  while (index < source.length) {
    const match = firstMatch(rules.constructs, source, index, ctx)
    if (Option.isNone(match)) {
      index++
      continue
    }
    flushText(index)
    const { node, length } = match.value
    out.push(withPosition(node, spanAt(origin, index, index + length)))
    index += length
    textStart = index
  }
  flushText(index)

  return out
}

const resolveOrigin = (origin: TokenizeInlineOptions['origin']): Origin => ({
  line: origin?.line ?? 0,
  column: origin?.column ?? 0,
  offset: origin?.offset ?? 0,
})

/**
 * インライン記法をノード列に分解する。改行を含まない 1 行分の文字列を渡すこと。
 *
 * 記法として成立しなかった文字は text ノードにまとまる。空文字列では空配列を返す。
 */
export const tokenizeInline = (
  source: string,
  options?: TokenizeInlineOptions,
): readonly InlineNode[] =>
  scan(
    source,
    resolveOrigin(options?.origin),
    options?.allowDecoration ?? true,
    resolveExtensions(options?.extensions),
  )

/**
 * 解決済みのルールで走査する内部向け入口。
 * 行ごとに `tokenizeInline` を呼ぶと拡張の解決が毎回走るので、それを避けたいときに使う。
 */
export const tokenizeInlineWith = (
  source: string,
  origin: Origin,
  rules: ResolvedExtensions,
): readonly InlineNode[] => scan(source, origin, true, rules)
