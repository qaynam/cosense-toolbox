import { Match, Option, pipe } from "effect"

import { isImageUrl } from "../../core/image-url"
import { isVideoUrl } from "../../core/media-url"
import { shiftOrigin } from "../../core/position"
import type { InlineNodeInit } from "../../types"
import type { InternalConstruct, ScanContext } from "../internal-types"
import type { ConstructMatch } from "../types"
import { opensCodeSpan } from "./inline-code"

/**
 * 大きい画像と動画の `[[URL]]`。URL は `]` を含まないので、最初の `]]` で閉じる。
 * `[[画像 URL]]]` は大きい画像と `]` になる (Cosense Web と同じ)。
 */
const LARGE_MEDIA = /^\[\[([^\]]+)\]\]/

/**
 * Cosense Web の strong の規則そのもの。深さは数えない。
 *
 * - 中身は空にできず、`[[` でも始められない。`[[[[x]]]]` は 2 文字目からの `[[[x]]]]` が太字になる
 * - 最初の `]]` から続く `]` の並びの、最後の 2 つで閉じる。`[[[リンク]]]` の中身は `[リンク]`
 *   なので、太字のリンクになる
 */
const STRONG = /^\[\[((?:[^[]|\[[^[]).*?\]*)\]\]/

/** `index` から `pattern` が読める `[[...]]` の中身。 */
const innerAt = (pattern: RegExp, source: string, index: number): Option.Option<string> =>
  Option.fromNullable(pattern.exec(source.slice(index))?.[1])

/** `[[` と `]]` を合わせた長さで読んだことにする。 */
const matchOf = (node: InlineNodeInit, inner: string): ConstructMatch => ({
  node,
  length: inner.length + 4,
})

/** URL が画像なら大きい画像、動画なら大きい動画。 */
const largeMediaAt = (source: string, index: number): Option.Option<ConstructMatch> =>
  pipe(
    innerAt(LARGE_MEDIA, source, index),
    Option.flatMap((url) =>
      pipe(
        Match.value(url).pipe(
          // Cosense Web が大きい画像にするのは URL だけ。`[[a.png]]` は `a.png` の太字の文字。
          Match.when(
            (src) => /^https?:\/\//i.test(src) && isImageUrl(src),
            (src) => Option.some<InlineNodeInit>({ type: "image", src, large: true }),
          ),
          Match.when(isVideoUrl, (src) =>
            Option.some<InlineNodeInit>({ type: "video", src, large: true }),
          ),
          Match.orElse(() => Option.none<InlineNodeInit>()),
        ),
        Option.map((node) => matchOf(node, url)),
      ),
    ),
  )

const boldAt = (source: string, index: number, ctx: ScanContext): Option.Option<ConstructMatch> =>
  Option.map(innerAt(STRONG, source, index), (value) =>
    matchOf(
      {
        type: "decoration",
        value,
        // `[[x]]` は記号を書かないが、太字なので `[* x]` と同じ扱いにする
        markers: ["*"],
        bold: true,
        italic: false,
        strike: false,
        underline: false,
        sizeLevel: 0,
        children: ctx.tokenize(value, shiftOrigin(ctx.origin, index + 2), false),
      },
      value,
    ),
  )

/**
 * `[[...]]` — Cosense Web の strong。中身が画像 URL なら大きい画像、動画 URL なら大きい動画、
 * そうでなければ太字 (規則は {@link STRONG})。`[[a] b]` のように `]]` で閉じないものは
 * bracketConstruct が読む。
 *
 * 音声や埋め込みの URL は大きくならず、太字の中の外部リンクになる (Cosense Web と同じ)。
 */
export const strongBracketConstruct: InternalConstruct = (source, index, ctx) =>
  pipe(
    largeMediaAt(source, index),
    Option.orElse(() => boldAt(source, index, ctx)),
    // 中でインラインコードが始まるなら記法にならない。Cosense Web はコードを先に読む
    Option.filter(({ length }) => !opensCodeSpan(source, index + 1, index + length - 2)),
  )
