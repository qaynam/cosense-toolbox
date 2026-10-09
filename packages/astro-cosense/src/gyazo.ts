/**
 * gyazo.ts — Gyazo の動画を、gif の `<img>` ではなく動画のプレーヤーで出す。
 *
 * 拡張子の無い Gyazo の URL は、parser の `toHast` が `https://gyazo.com/{hash}/raw` の `<img>` にする。
 * `/raw` は動画 (Gyazo GIF の録画) なら gif に転送されるので、通信しなくても動く画像として表示できる。
 * それより動画のプレーヤーで見せたいときだけ、ビルド時に oEmbed で画像か動画かを聞いて差し替える。
 */
import { defaultClassNames } from "@cosense-toolbox/parser/html"
import type { Root } from "hast"

import { elementsIn, type HastLike } from "./hast"

export interface GyazoVideoOptions {
  /**
   * 動画の出し方。
   *
   * - `'video'`：`https://i.gyazo.com/{hash}.mp4` を `<video>` で出す
   * - `'iframe'`：Gyazo のプレーヤー (`https://gyazo.com/player/{hash}`) を `<iframe>` で出す
   */
  readonly as: "video" | "iframe"
  /** 差し替えた要素に付ける class 名。parser の `toHast` の `classNames` と同じもの。省略したものは parser の既定 */
  readonly classNames?: { readonly video?: string | undefined; readonly embed?: string | undefined }
  readonly fetch?: typeof globalThis.fetch
  /** oEmbed に聞けなかったときに呼ぶ */
  readonly warn?: (message: string) => void
}

/** parser の `asImageSrc` が、拡張子の無い Gyazo の URL から作る形。 */
const RAW_RE = /^https:\/\/gyazo\.com\/([0-9a-f]{20,})\/raw$/i

const oembedUrlOf = (hash: string): string =>
  `https://api.gyazo.com/api/oembed?url=${encodeURIComponent(`https://gyazo.com/${hash}`)}`

const classNameOf = (name: string | undefined): string[] =>
  (name ?? "").split(/\s+/).filter((part) => part !== "")

/** 動画の要素の属性。parser の `toHast` が出す `<video>` / 埋め込みの `<iframe>` にそろえる。 */
const videoElementOf = (
  hash: string,
  large: unknown,
  options: GyazoVideoOptions,
): { tagName: string; properties: Record<string, unknown> } => {
  return options.as === "video"
    ? {
        tagName: "video",
        properties: {
          className: classNameOf(options.classNames?.video ?? defaultClassNames.video),
          src: `https://i.gyazo.com/${hash}.mp4`,
          controls: true,
          loop: true,
          preload: "metadata",
          dataLarge: large,
        },
      }
    : {
        tagName: "iframe",
        properties: {
          className: classNameOf(options.classNames?.embed ?? defaultClassNames.embed),
          src: `https://gyazo.com/player/${hash}`,
          title: "Gyazo",
          loading: "lazy",
          allow: "fullscreen",
          dataProvider: "gyazo",
          dataLarge: large,
        },
      }
}

/**
 * `.csn` / `.csnx` の hast の中で、Gyazo の動画を指す `<img>` を動画の要素に差し替える rehype プラグイン。
 * 画像か動画かは hash ごとに一度だけ聞き、同じプラグインで描画するページの間で使い回す。
 */
export const rehypeGyazoVideos = (options: GyazoVideoOptions) => {
  const fetch = options.fetch ?? globalThis.fetch
  const lookups = new Map<string, Promise<boolean>>()

  const lookup = async (hash: string): Promise<boolean> => {
    try {
      const response = await fetch(oembedUrlOf(hash))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const { type } = (await response.json()) as { readonly type?: unknown }
      return type === "video"
    } catch (error) {
      // 1 つの動画のためにビルド全体を止めない。gif の <img> のまま出す。
      options.warn?.(`Gyazo の ${hash} が動画か分からないので、画像のまま出す: ${String(error)}`)
      return false
    }
  }

  const isVideo = (hash: string): Promise<boolean> => {
    const cached = lookups.get(hash) ?? lookup(hash)
    lookups.set(hash, cached)
    return cached
  }

  return () => async (tree: Root) => {
    await Promise.all(
      elementsIn(tree as HastLike, "img").map(async (element) => {
        const hash = RAW_RE.exec(String(element.properties?.src ?? ""))?.[1]
        if (hash === undefined || !(await isVideo(hash))) return
        // hast は要素をその場で書き換えるのが決まり。fallback の中の要素は親から差し替えられない。
        Object.assign(element, videoElementOf(hash, element.properties?.dataLarge, options))
      }),
    )
  }
}
