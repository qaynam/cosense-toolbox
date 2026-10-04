import { Option } from "effect"

import { isImageUrl } from "../../core/image-url"
import { isVideoUrl } from "../../core/media-url"
import { shiftOrigin } from "../../core/position"
import type { InlineNodeInit } from "../../types"
import type { InternalConstruct } from "../internal-types"
import { opensCodeSpan } from "./inline-code"

/**
 * `[[...]]` — Cosense Web の strong。`]]` で閉じるときだけ成立する
 * (深さは数えない。`[[a] b]` のようなケースは bracketConstruct 側で処理される)。
 *
 * 中身が画像 URL なら大きい画像、動画 URL なら大きい動画、そうでなければ太字装飾になる。
 * 音声や埋め込みの URL は大きくならず、太字の中の外部リンクになる (Cosense Web と同じ)。
 */
export const strongBracketConstruct: InternalConstruct = (source, index, ctx) => {
  if (source[index] !== "[" || source[index + 1] !== "[") return Option.none()

  const end = source.indexOf("]]", index + 2)
  // 中でインラインコードが始まるなら記法にならない。Cosense Web はコードを先に読む
  if (end < 0 || opensCodeSpan(source, index + 1, end)) return Option.none()

  const inner = source.slice(index + 2, end)
  const length = end + 2 - index

  if (isImageUrl(inner)) {
    const node: InlineNodeInit = { type: "image", src: inner, large: true }
    return Option.some({ node, length })
  }

  if (isVideoUrl(inner)) {
    const node: InlineNodeInit = { type: "video", src: inner, large: true }
    return Option.some({ node, length })
  }

  return Option.some({
    node: {
      type: "decoration",
      value: inner,
      // `[[x]]` は記号を書かないが、太字なので `[* x]` と同じ扱いにする
      markers: ["*"],
      bold: true,
      italic: false,
      strike: false,
      underline: false,
      sizeLevel: 0,
      children: ctx.tokenize(inner, shiftOrigin(ctx.origin, index + 2), false),
    },
    length,
  })
}
