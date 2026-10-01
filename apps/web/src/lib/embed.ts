import type { EmbedNode, Extension, LocationNode } from "@cosense-toolbox/parser"
import {
  defaultHastHandlers,
  type HastContent,
  type HastHandlers,
} from "@cosense-toolbox/parser/html"

const APPLE_MUSIC =
  /^https:\/\/music\.apple\.com\/[a-z]{2}\/(?:album|playlist|song)\/\S+\/(\w+)(?:\?\S*)?$/
const INSTAGRAM = /^https:\/\/www\.instagram\.com\/(?:p|reel)\/([\w-]+)\/?(?:\?\S*)?$/

/** Cosense Web が埋め込まない Apple Music と Instagram の URL を、埋め込みとして読む。 */
export const extraEmbeds = (): Extension => ({
  bracketRules: [
    (inner) => {
      const id = APPLE_MUSIC.exec(inner)?.[1]
      return id === undefined ? null : { type: "embed", provider: "appleMusic", url: inner, id }
    },
    (inner) => {
      const id = INSTAGRAM.exec(inner)?.[1]
      return id === undefined ? null : { type: "embed", provider: "instagram", url: inner, id }
    },
  ],
})

const iframe = (className: string, src: string, title: string): HastContent => ({
  type: "element",
  tagName: "iframe",
  properties: { className: [className], src, title, loading: "lazy" },
  children: [],
})

/**
 * Instagram は iframe の URL を公開していない。公式の埋め込みと同じく blockquote を置き、
 * embed.js に iframe へ置き換えさせる。script を投稿の隣に置くのは、投稿のあるページでだけ読ませるため。
 * script が動かなくても、投稿へのリンクとしては読める。
 */
const instagram = (node: EmbedNode): HastContent[] => [
  {
    type: "element",
    tagName: "blockquote",
    properties: {
      className: ["instagram-media"],
      dataInstgrmPermalink: `https://www.instagram.com/p/${node.id}/`,
      dataInstgrmVersion: "14",
    },
    children: [
      {
        type: "element",
        tagName: "a",
        properties: { href: node.url },
        children: [{ type: "text", value: node.url }],
      },
    ],
  },
  {
    type: "element",
    tagName: "script",
    properties: { async: true, src: "https://www.instagram.com/embed.js" },
    children: [],
  },
]

/** 自分で足したサービスだけ描き、YouTube などは既定の描画に任せる。 */
export const embed: HastHandlers["embed"] = (node, ctx) => {
  switch (node.provider) {
    case "appleMusic":
      return iframe(
        "embed-apple-music",
        node.url.replace("://music.apple.com/", "://embed.music.apple.com/"),
        "Apple Music",
      )
    case "instagram":
      return instagram(node)
    default:
      return defaultHastHandlers.embed(node, ctx)
  }
}

/** ズームが無い地図は、Cosense Web がラベルで検索するときと同じ 15 で開く。 */
const DEFAULT_ZOOM = 15

/**
 * 地図を OpenStreetMap で描く。OpenStreetMap の埋め込みはズームではなく表示する範囲を取るので、
 * ズームが 1 上がるごとに半分になる幅を、座標の周りに取る。
 */
export const location: HastHandlers["location"] = (node: LocationNode) => {
  const { latitude, longitude, zoom = DEFAULT_ZOOM } = node
  const span = 360 / 2 ** zoom
  const bbox = [longitude - span, latitude - span / 2, longitude + span, latitude + span / 2]
  const params = new URLSearchParams({
    bbox: bbox.join(","),
    layer: "mapnik",
    marker: `${latitude},${longitude}`,
  })
  return iframe(
    "embed-map",
    `https://www.openstreetmap.org/export/embed.html?${params}`,
    node.label ?? "地図",
  )
}
