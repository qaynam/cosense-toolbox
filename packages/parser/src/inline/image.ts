/**
 * image.ts — URL が画像かどうかの判定。
 *
 * `[url]` が image ノードになるか externalLink ノードになるかを分けるので、
 * この判定だけは記法の構造の一部としてパーサーが持つ。
 * oEmbed の取得や動画判定のような URL の意味解決はこのパッケージの外の仕事。
 */
import { Option } from 'effect'

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

/** Gyazo のページ URL / 画像 URL から hash を取り出す。 */
const GYAZO_RE = /^https?:\/\/(?:i\.)?gyazo\.com\/([0-9a-f]{20,})/i

/** 末尾が画像の拡張子か。URL でなくてもよい (`a.png` のような相対パスも真になる)。 */
export const hasImageExtension = (s: string): boolean => IMAGE_EXT_RE.test(s)

/**
 * URL が画像なら表示用の URL を返す。
 *
 * 拡張子の見方は 2 通りあり、どちらかに当たれば画像とみなす:
 *  1. フラグメントの末尾が拡張子。拡張子を持たない配信 URL に `#.svg` / `#.png` を足して
 *     「これは画像」と教える Cosense の書き方 (`https://x/api/status?id=1#.svg`)。
 *  2. クエリ / フラグメントを落としたパスの末尾が拡張子。画像 CDN の
 *     `....jpeg?fit=bounds&width=1280` のような URL 用。
 *
 * 1 をフラグメント限定にしているのは、`/img?url=https://y/a.png` のように
 * 「クエリの中にだけ拡張子がある」URL を画像と誤判定しないため。
 */
export const imageSrc = (url: string): Option.Option<string> => {
  const gyazo = url.match(GYAZO_RE)
  if (gyazo) return Option.some(`https://i.gyazo.com/${gyazo[1]}.png`)

  const hash = url.indexOf('#')
  if (hash >= 0 && IMAGE_EXT_RE.test(url.slice(hash))) return Option.some(url)
  if (IMAGE_EXT_RE.test(url.replace(/[?#].*$/, ''))) return Option.some(url)
  return Option.none()
}

/** URL が画像なら表示用の URL を、違えば null を返す。 */
export const asImageSrc = (url: string): string | null => Option.getOrNull(imageSrc(url))
