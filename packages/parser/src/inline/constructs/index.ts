/**
 * 行内の走査ルールの登録場所。**配列の順序が仕様**なので既存の順序を動かさないこと。
 * `[[` は `[` より先に試す必要がある (先に `[` が食べると strong にならない)。
 */
import type { InlineConstruct } from '../types'
import { bareUrlConstruct } from './bare-url'
import { bracketConstruct } from './bracket'
import { hashtagConstruct } from './hashtag'
import { inlineCodeConstruct } from './inline-code'
import { strongBracketConstruct } from './strong-bracket'

export const inlineConstructs: readonly InlineConstruct[] = [
  strongBracketConstruct,
  bracketConstruct,
  inlineCodeConstruct,
  hashtagConstruct,
  bareUrlConstruct,
]

export { bareUrlConstruct, bracketConstruct, hashtagConstruct }
export { inlineCodeConstruct, strongBracketConstruct }
