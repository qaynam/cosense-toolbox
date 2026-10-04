import { Option, pipe } from "effect"

import { isLinkedVideoUrl, isVideoUrl } from "../../core/media-url"
import type { InlineNodeInit } from "../../types"
import type { InternalBracketRule } from "../internal-types"

const TWO_URLS_RE = /^(https?:\/\/\S+)\s+(https?:\/\/\S+)$/i

const linkedVideo = (link: string, video: string): Option.Option<InlineNodeInit> =>
  pipe(
    Option.liftPredicate(video, isLinkedVideoUrl),
    Option.map((src): InlineNodeInit => ({ type: "video", src, link })),
  )

/**
 * 動画の URL だけの角括弧 (`[動画]`) と、URL を 2 つ並べたリンク付き動画 (`[リンク 動画]` / `[動画 リンク]`)。
 *
 * 画像より先に試すので、`[画像 動画]` は画像をリンク先にした動画になる。
 * 2 つとも動画なら、後ろを動画、前をリンク先にする。どちらも Cosense Web の規則の順序に合わせている。
 */
export const videoRule: InternalBracketRule = (inner) =>
  pipe(
    Option.liftPredicate(inner, isVideoUrl),
    Option.map((src): InlineNodeInit => ({ type: "video", src })),
    Option.orElse(() =>
      pipe(
        Option.fromNullable(TWO_URLS_RE.exec(inner)),
        Option.flatMap(([, first = "", second = ""]) =>
          pipe(
            linkedVideo(first, second),
            Option.orElse(() => linkedVideo(second, first)),
          ),
        ),
      ),
    ),
  )
