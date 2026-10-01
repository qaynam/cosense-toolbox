import { Option, pipe } from "effect"

import { embedOf } from "../../core/media-url"
import type { InlineNodeInit } from "../../types"
import type { InternalBracketRule } from "../internal-types"

/**
 * YouTube / Vimeo / Spotify / anchor.fm の URL だけの角括弧。プレーヤーの埋め込みになる。
 * URL の前後に文字があると埋め込みにならず、ラベル付きの外部リンクになる (Cosense Web と同じ)。
 */
export const embedRule: InternalBracketRule = (inner) =>
  pipe(
    embedOf(inner),
    Option.map((target): InlineNodeInit => ({ type: "embed", url: inner, ...target })),
  )
