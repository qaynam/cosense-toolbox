/**
 * `[...]` の中身を解釈するルールの登録場所。**配列の順序が仕様**なので、
 * 既存の順序を動かさないこと (順序が変わると `[* [リンク]ですね]` のような
 * 入れ子ケースの解釈が変わる)。新しいルールは 1 ファイル 1 ルールで追加する。
 */
import type { InternalBracketRule } from "../internal-types"
import { audioRule } from "./audio"
import { decorationRule } from "./decoration"
import { embedRule } from "./embed"
import { formulaRule } from "./formula"
import { iconRule } from "./icon"
import { imageExtensionRule } from "./image-extension"
import { internalLinkRule } from "./internal-link"
import { projectLinkRule } from "./project-link"
import { urlRule } from "./url"
import { videoRule } from "./video"

/** 中身に角括弧を含んでいても成立しうるルール。 */
export const bracketRules: readonly InternalBracketRule[] = [formulaRule, decorationRule]

/**
 * 「単純ターゲット」のルール。中身に `[` / `]` を含むときは試さない (Cosense Web に合わせている)。
 * これにより `[[そうね] ですね]` の外側は記法にならず、先頭の `[` が素の文字になる。
 * 埋め込み・動画・音声は、URL を含む中身を必ず受け取る urlRule より先に試す。
 * 末尾の internalLinkRule は常に成立する catch-all。
 */
export const simpleTargetRules: readonly InternalBracketRule[] = [
  iconRule,
  embedRule,
  videoRule,
  audioRule,
  urlRule,
  imageExtensionRule,
  projectLinkRule,
  internalLinkRule,
]

export { audioRule, decorationRule, embedRule, formulaRule, iconRule, imageExtensionRule }
export { internalLinkRule, projectLinkRule, urlRule, videoRule }
