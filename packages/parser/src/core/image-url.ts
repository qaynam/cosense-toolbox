/**
 * image-url.ts — URL が画像かどうかの判定と、表示用 URL への変換。
 *
 * 判定は `[url]` が image ノードになるか externalLink ノードになるかを分けるので、
 * 記法の構造の一部としてパーサーが持つ。変換のほうは表示のための書き換えなので
 * パースでは行わず、描画する側 (`compile/`) が明示的に呼ぶ。
 * oEmbed の取得や動画判定のような URL の意味解決はこのパッケージの外の仕事。
 */
import { Option, pipe } from 'effect'

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

/** Gyazo のページ URL / 画像 URL から hash を取り出す。 */
const GYAZO_RE = /^https?:\/\/(?:i\.)?gyazo\.com\/([0-9a-f]{20,})/i

/** 末尾が画像の拡張子か。URL でなくてもよい (`a.png` のような相対パスも真になる)。 */
export const hasImageExtension = (s: string): boolean => IMAGE_EXT_RE.test(s)

/**
 * Gyazo のページ URL は拡張子を持たないが画像として表示される。
 * `<img>` に入れるには hash から画像 URL を組み立て直す必要がある。
 */
const gyazoSrc = (url: string): Option.Option<string> =>
  pipe(
    Option.fromNullable(url.match(GYAZO_RE)?.[1]),
    Option.map((hash) => `https://i.gyazo.com/${hash}.png`),
  )

/**
 * フラグメントの末尾が拡張子。拡張子を持たない配信 URL に `#.svg` / `#.png` を足して
 * 「これは画像」と教える Cosense の書き方 (`https://x/api/status?id=1#.svg`) のため。
 */
const fragmentSrc = (url: string): Option.Option<string> => {
  const hash = url.indexOf('#')
  return hash >= 0 && IMAGE_EXT_RE.test(url.slice(hash)) ? Option.some(url) : Option.none()
}

/**
 * クエリ / フラグメントを落としたパスの末尾が拡張子。画像 CDN の
 * `....jpeg?fit=bounds&width=1280` のような URL のため。
 *
 * フラグメントを別に見ているのは、`/img?url=https://y/a.png` のように
 * 「クエリの中にだけ拡張子がある」URL を画像と誤判定しないため。
 */
const pathSrc = (url: string): Option.Option<string> =>
  IMAGE_EXT_RE.test(url.replace(/[?#].*$/, '')) ? Option.some(url) : Option.none()

/** `<img src>` に入れられる形の URL。画像でなければ None。 */
const imageSrc = (url: string): Option.Option<string> =>
  pipe(
    gyazoSrc(url),
    Option.orElse(() => fragmentSrc(url)),
    Option.orElse(() => pathSrc(url)),
  )

/** URL が画像として表示されるものか。判定だけを行い、URL は書き換えない。 */
export const isImageUrl = (url: string): boolean => Option.isSome(imageSrc(url))

/**
 * 画像 URL なら `<img src>` に入れられる形にして返す。画像でなければ null。
 *
 * Gyazo のページ URL はここでだけ `https://i.gyazo.com/{hash}.png` に差し替わる。
 * `parse()` はこの変換を行わない (AST はソースに書かれた文字列を保つ)。
 */
export const asImageSrc = (url: string): string | null => Option.getOrNull(imageSrc(url))
