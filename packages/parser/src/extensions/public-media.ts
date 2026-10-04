import { Option, pipe } from "effect"

import { mediaKindOf } from "../core/media-url"
import type { Extension } from "../inline/types"
import type { InlineNodeInit } from "../types"

/** `:` のすぐ後の `/` からがパス。空白と角括弧は、記法の区切りと見分けられないので含めない。 */
const PATH_RE = /^:(\/[^\s[\]]+)$/

export interface PublicMediaOptions {
  /**
   * パスの前に付ける、サイトの置き場所 (Astro の `base` など)。末尾の `/` は 1 つにまとめる
   *
   * @defaultValue `""` (サイトの根元)
   */
  readonly base?: string
}

/** `[:/…]` の中身が指すメディア。 */
const mediaAt = (inner: string, root: string, large: boolean): Option.Option<InlineNodeInit> =>
  pipe(
    Option.fromNullable(PATH_RE.exec(inner)?.[1]),
    Option.flatMap((path) =>
      Option.map(mediaKindOf(path), (kind) => ({ kind, src: `${root}${path}` })),
    ),
    // 音声には大きい表示が無い (Cosense Web でも `[[音声]]` は太字のまま)。
    Option.filter(({ kind }) => !large || kind !== "audio"),
    Option.map(({ kind, src }): InlineNodeInit =>
      large ? { type: kind, src, large } : { type: kind, src },
    ),
  )

/**
 * サイトに置いたファイル (Astro なら `public/` の下) を、`[:/images/a.png]` のように
 * サイトの根元からのパスで画像・動画・音声として読む拡張。Cosense Web には無い記法。
 *
 * Cosense Web では `[a.png]` も `[:/images/a.png]` もページへのリンクで、既定のパーサーも同じに読む。
 * `:/` で始まる題名のページはまず無いので、その形だけを手元のファイルとして読む。
 * 種類は拡張子で決める。メディアでない拡張子 (`.pdf` など) は、ページへのリンクのまま。
 *
 * - `[:/images/a.png]` は画像、`[:/movies/a.mp4]` は動画、`[:/audio/a.mp3]` は音声
 * - `[[:/images/a.png]]` は大きい画像、`[[:/movies/a.mp4]]` は大きい動画
 * - 装飾の中では、URL の画像と同じくリンクのまま
 *
 * ノードの `src` は、`base` を付けたサイトの中のパス (`/docs/images/a.png`) になる。
 *
 * @example
 * parse(source, { extensions: [publicMedia({ base: "/docs" })] })
 */
export const publicMedia = ({ base = "" }: PublicMediaOptions = {}): Extension => {
  const root = base.replace(/\/+$/, "")
  return {
    bracketRules: [
      (inner, ctx) => (ctx.allowDecoration ? Option.getOrNull(mediaAt(inner, root, false)) : null),
    ],
    constructs: [
      (source, index) => {
        if (!source.startsWith("[[:/", index)) return null
        const end = source.indexOf("]]", index + 2)
        return end < 0
          ? null
          : pipe(
              mediaAt(source.slice(index + 2, end), root, true),
              Option.map((node) => ({ node, length: end + 2 - index })),
              Option.getOrNull,
            )
      },
    ],
  }
}
