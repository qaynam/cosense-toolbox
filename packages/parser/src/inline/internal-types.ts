/**
 * internal-types.ts — パッケージの中のルールの型。公開しない。
 *
 * 公開の型 (`types.ts`) と別のファイルにしているのは、拡張を書く人が読む型定義に
 * effect の import を出さないため。
 */
import type { Option } from 'effect'

import type { InlineNodeInit } from '../types'
import type { BracketRuleContext, ConstructMatch, InlineContext } from './types'

/** 走査ループがルールに渡す文脈。拡張が足した `[...]` のルールも持つ。 */
export interface ScanContext extends InlineContext {
  /** 拡張が追加した `[...]` のルール。既定のルールより先に試される */
  readonly bracketRules: readonly InternalBracketRule[]
}

export interface BracketScanContext extends ScanContext, BracketRuleContext {}

/** パッケージの中の走査ルール。成立しなければ None。 */
export type InternalConstruct = (
  source: string,
  index: number,
  ctx: ScanContext,
) => Option.Option<ConstructMatch>

/** パッケージの中の `[...]` のルール。成立しなければ None。 */
export type InternalBracketRule = (
  inner: string,
  ctx: BracketScanContext,
) => Option.Option<InlineNodeInit>
