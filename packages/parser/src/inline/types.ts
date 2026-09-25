/**
 * types.ts (inline) — 記法ルールの型契約。
 *
 * プラグインが記法を追加するときの拡張点でもあるので、型だけを置き実装は持たない。
 *
 * 拡張を書く人向けの型 (`InlineConstruct` / `BracketRule`) は、成立しなければ null を返す普通の関数にしてある。
 * 拡張を書くのに effect を入れたり `Option` を覚えたりしなくて済むようにするため。
 * パッケージの中のルールは `Option` で書く (`internal-types.ts` の `InternalConstruct` / `InternalBracketRule`)。
 * 拡張のルールは `resolveExtensions` で中の形に包んでから、既定のルールと同じように試す。
 */
import type { Origin } from '../core/position'
import type { InlineNode, InlineNodeInit } from '../types'

/**
 * 走査中に共有される文脈。拡張のルールにもこの形で渡る。
 *
 * `tokenize` は装飾の中身のように部分文字列を再帰的に解析するためのフック。
 * ルールが走査ループを直接 import すると循環参照になるので、文脈経由で渡している。
 */
export interface InlineContext {
  /** 装飾記法 (`[* ]` 等) を解釈してよいか。装飾の中では false (入れ子不可) */
  readonly allowDecoration: boolean
  /** 走査対象 `source` のインデックス 0 がソース上のどこか */
  readonly origin: Origin
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
 * 行内の走査ルール。`source[index]` から記法が始まるなら、そのノードと消費した文字数を返す。
 *
 * null を返すと呼び出し側は 1 文字を素のテキストとして消費して次に進むので、
 * 「記法として無効なので `[` は素の文字」といったケースも null で表せる。
 */
export type InlineConstruct = (
  source: string,
  index: number,
  ctx: InlineContext,
) => ConstructMatch | null

/** `[...]` の中身を解釈するルールに渡る文脈。 */
export interface BracketRuleContext extends InlineContext {
  /** `inner` のインデックス 0 がソース上のどこか (子ノードの位置計算に使う) */
  readonly innerOrigin: Origin
}

/**
 * `[...]` の中身を解釈するルール。角括弧そのものは呼び出し側が扱うので、
 * ルールは中身の文字列だけを見る。null なら次のルールへ、全部 null なら記法として無効。
 */
export type BracketRule = (inner: string, ctx: BracketRuleContext) => InlineNodeInit | null

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
