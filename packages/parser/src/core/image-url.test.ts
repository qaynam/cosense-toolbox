import { describe, expect, it } from "vitest"

import { parseLine } from "../index"
import type { ImageNode } from "../types"
import { imageSrcOf, isImageUrl } from "./image-url"

describe("isImageUrl", () => {
  it("パス末尾が画像拡張子なら画像として扱う", () => {
    expect(isImageUrl("https://x.com/a.png")).toBe(true)
    expect(isImageUrl("https://x.com/a.jpeg?w=100&h=50")).toBe(true)
    expect(isImageUrl("https://x.com/a.svg#foo")).toBe(true)
  })

  it("拡張子を持たない URL に #.svg を足すと画像として扱う", () => {
    // 配信 URL に「これは画像」と教える Cosense の慣習。
    expect(isImageUrl("https://kanban.example.dev/api/status/abc?userId=xyz#.svg")).toBe(true)
    expect(isImageUrl("https://x.com/chart?id=1#.png")).toBe(true)
  })

  it("クエリの中にだけ拡張子がある URL は画像として扱わない", () => {
    expect(isImageUrl("https://x.com/img?url=https://y.com/a.png")).toBe(false)
  })

  it("拡張子が無ければ画像として扱わない", () => {
    expect(isImageUrl("https://x.com/page")).toBe(false)
  })

  it("Gyazo のページ URL は拡張子が無くても画像として扱う", () => {
    expect(isImageUrl("https://gyazo.com/503a911fea542532aa5aba0a88eb7b60")).toBe(true)
  })

  it("Gyazo の URL でも、動画の拡張子が付いていれば画像として扱わない", () => {
    expect(isImageUrl("https://gyazo.com/503a911fea542532aa5aba0a88eb7b60.mp4")).toBe(false)
  })
})

/** `[url]` を読んで得た画像ノード。 */
const imageOf = (url: string): ImageNode => {
  const [node] = parseLine(`[${url}]`).children
  if (node?.type !== "image") throw new Error(`${url} は画像ノードにならない`)
  return node
}

describe("imageSrcOf", () => {
  it("画像の URL は書かれたまま返す", () => {
    expect(imageSrcOf(imageOf("https://x.com/a.png"))).toBe("https://x.com/a.png")
    expect(imageSrcOf(imageOf("https://x.com/a.jpeg?w=100&h=50"))).toBe(
      "https://x.com/a.jpeg?w=100&h=50",
    )
  })

  it("ハッシュだけの Gyazo の URL は、ファイルへ転送される /raw にする", () => {
    // これは表示のための変換なので parse() は行わない。使う側が明示的に呼ぶ。
    const hash = "503a911fea542532aa5aba0a88eb7b60"
    expect(imageSrcOf(imageOf(`https://gyazo.com/${hash}`))).toBe(`https://gyazo.com/${hash}/raw`)
  })

  it("i.gyazo.com のハッシュだけの URL も、gyazo.com の /raw にする", () => {
    const hash = "503a911fea542532aa5aba0a88eb7b60"
    expect(imageSrcOf(imageOf(`https://i.gyazo.com/${hash}`))).toBe(`https://gyazo.com/${hash}/raw`)
  })

  it("ハッシュだけの Gyazo の URL は、末尾のスラッシュやクエリが付いていても /raw にする", () => {
    const hash = "503a911fea542532aa5aba0a88eb7b60"
    expect(imageSrcOf(imageOf(`https://gyazo.com/${hash}/`))).toBe(`https://gyazo.com/${hash}/raw`)
    expect(imageSrcOf(imageOf(`https://gyazo.com/${hash}?a=1`))).toBe(
      `https://gyazo.com/${hash}/raw`,
    )
  })

  it("拡張子の付いた Gyazo の URL は、書かれたままにする", () => {
    const hash = "503a911fea542532aa5aba0a88eb7b60"
    expect(imageSrcOf(imageOf(`https://i.gyazo.com/${hash}.jpg`))).toBe(
      `https://i.gyazo.com/${hash}.jpg`,
    )
    expect(imageSrcOf(imageOf(`https://gyazo.com/${hash}.gif`))).toBe(
      `https://gyazo.com/${hash}.gif`,
    )
  })

  it("/max_size のような、ファイルを指す Gyazo の URL は書かれたままにする", () => {
    const hash = "503a911fea542532aa5aba0a88eb7b60"
    expect(imageSrcOf(imageOf(`https://gyazo.com/${hash}/max_size/1000`))).toBe(
      `https://gyazo.com/${hash}/max_size/1000`,
    )
  })
})
