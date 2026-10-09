/**
 * image-url.ts — URL が画像かどうかの判定と、表示用 URL への変換。
 *
 * 判定は `[url]` が image ノードになるか externalLink ノードになるかを分けるので、
 * 記法の構造の一部としてパーサーが持つ。変換のほうは表示のための書き換えなので
 * パースでは行わず、描画する側 (`compile/`) が明示的に呼ぶ。
 * 動画・音声・埋め込みの判定は `media-url.ts`。oEmbed の取得のような通信の要る解決はこのパッケージの外の仕事。
 */
import { Option, pipe } from "effect"

import type { ImageNode } from "../types"

export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

/** Gyazo の URL のうち、画像として表示するもの。 */
const GYAZO_RE =
  /^https?:\/\/(?:i\.)?gyazo\.com\/[0-9a-f]{20,}(?:\.(?:png|jpe?g|gif|webp|svg|bmp|avif))?(?:[/?#]|$)/i

/** hash だけの Gyazo の URL。ファイルではなく Gyazo のページを指す。 */
const GYAZO_PAGE_RE = /^https?:\/\/(?:i\.)?gyazo\.com\/([0-9a-f]{20,})\/?(?:[?#].*)?$/i

/**
 * hash だけの Gyazo の URL を `/raw` にする。それ以外は None。
 * Gyazo のページ URL は HTML を返すので `<img>` に入れられない。`/raw` は Gyazo がその hash の
 * 本来のファイル (png / jpg / gif) へ転送してくれるので、拡張子を推測しなくてよい。
 */
const gyazoRawUrl = (url: string): Option.Option<string> =>
  pipe(
    Option.fromNullable(url.match(GYAZO_PAGE_RE)?.[1]),
    Option.map((hash) => `https://gyazo.com/${hash}/raw`),
  )

/**
 * フラグメントの末尾が拡張子。拡張子を持たない配信 URL に `#.svg` / `#.png` を足して
 * 「これは画像」と教える Cosense の書き方 (`https://x/api/status?id=1#.svg`) のため。
 */
const hasImageFragment = (url: string): boolean => {
  const hash = url.indexOf("#")
  return hash >= 0 && IMAGE_EXT_RE.test(url.slice(hash))
}

/**
 * クエリ / フラグメントを落としたパスの末尾が拡張子。画像 CDN の
 * `....jpeg?fit=bounds&width=1280` のような URL のため。
 *
 * フラグメントを別に見ているのは、`/img?url=https://y/a.png` のように
 * 「クエリの中にだけ拡張子がある」URL を画像と誤判定しないため。
 */
const hasImageExtension = (url: string): boolean => IMAGE_EXT_RE.test(url.replace(/[?#].*$/, ""))

/** URL が画像として表示されるものか。判定だけを行い、URL は書き換えない。 */
export const isImageUrl = (url: string): boolean =>
  GYAZO_RE.test(url) || hasImageFragment(url) || hasImageExtension(url)

/**
 * 画像ノードを `<img src>` に入れる URL。
 *
 * ほとんどの画像は書かれた URL のまま。hash だけの Gyazo の URL だけが、ここで
 * `https://gyazo.com/{hash}/raw` に差し替わる。`parse()` はこの変換を行わない
 * (AST はソースに書かれた文字列を保つ)。
 */
export const imageSrcOf = (node: ImageNode): string =>
  Option.getOrElse(gyazoRawUrl(node.src), () => node.src)
