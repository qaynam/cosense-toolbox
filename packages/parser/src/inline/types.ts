/**
 * types.ts (inline) — 記法ルールの型契約。
 *
 * プラグインが記法を追加するときの拡張点でもあるので、型だけを置き実装は持たない。
 */
import type { Option } from 'effect'
import type { Origin } from '../core/position'
import type { InlineNode, InlineNodeInit } from '../types'

/**
 * 走査中に共有される文脈。
 *
 * `tokenize` は装飾の中身のように部分文字列を再帰的に解析するためのフック。
 * ルールが走査ループを直接 import すると循環参照になるので、文脈経由で渡している。
 */
export interface InlineContext {
  /** 装飾記法 (`[* ]` 等) を解釈してよいか。装飾の中では false (入れ子不可) */
  readonly allowDecoration: boolean
  /** 走査対象 `source` のインデックス 0 がソース上のどこか */
  readonly origin: Origin
  /** 拡張が追加した `[...]` のルール。既定のルールより先に試される */
  readonly bracketRules: readonly BracketRule[]
  readonly tokenize: (
    source: string,
    origin: Origin,
    allowDecoration: boolean,
  ) => readonly InlineNode[]
}

/** 記法が成立したときの結果。`length` は `index` から消費した文字数。 */
export interface ConstructMatch {
  readonly node: InlineNodeInit
  readonly length: number
}

/**
 * 行内の走査ルール。`source[index]` から記法が始まるなら Some を返す。
 *
 * None を返すと呼び出し側は 1 文字を素のテキストとして消費して次に進むので、
 * 「記法として無効なので `[` は素の文字」といったケースも None で表せる。
 */
export type InlineConstruct = (
  source: string,
  index: number,
  ctx: InlineContext,
) => Option.Option<ConstructMatch>

/** `[...]` の中身を解釈するルールに渡る文脈。 */
export interface BracketRuleContext extends InlineContext {
  /** `inner` のインデックス 0 がソース上のどこか (子ノードの位置計算に使う) */
  readonly innerOrigin: Origin
}

/**
 * `[...]` の中身を解釈するルール。角括弧そのものは呼び出し側が扱うので、
 * ルールは中身の文字列だけを見る。None なら次のルールへ、全部 None なら記法として無効。
 */
export type BracketRule = (inner: string, ctx: BracketRuleContext) => Option.Option<InlineNodeInit>

/**
 * 記法の拡張。`parse` / `tokenizeInline` の options に渡すと、
 * **既定のルールより先に**試されるようになる。
 *
 * 既定の記法を無効化する手段は今のところ用意していない (必要になれば非破壊に追加する)。
 */
export interface Extension {
  /** 行内の走査ルール。新しい開始文字を持つ記法を足すときはこちら */
  readonly constructs?: readonly InlineConstruct[]
  /** `[...]` の中身の解釈ルール。角括弧記法のバリエーションを足すときはこちら */
  readonly bracketRules?: readonly BracketRule[]
}
