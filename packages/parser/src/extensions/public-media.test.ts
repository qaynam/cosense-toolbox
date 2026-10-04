import { describe, expect, it } from "vitest"

import { parseLine } from "../parse"
import { stripPositions } from "../test-helpers"
import { publicMedia } from "./public-media"

/** `source` を拡張つきで読んだ行の中身。 */
const read = (source: string, options?: Parameters<typeof publicMedia>[0]) =>
  stripPositions(parseLine(source, { extensions: [publicMedia(options)] }).children)

describe("publicMedia", () => {
  it("[:/…] の画像は、サイトの根元からのパスの画像になる", () => {
    expect(read("[:/images/a.png]")).toEqual([{ type: "image", src: "/images/a.png" }])
  })

  it("動画と音声も拡張子で見分ける", () => {
    expect(read("[:/movies/demo.mp4] [:/audio/bgm.mp3]")).toEqual([
      { type: "video", src: "/movies/demo.mp4" },
      { type: "text", value: " " },
      { type: "audio", src: "/audio/bgm.mp3" },
    ])
  })

  it("[[:/…]] は大きい画像・動画になる", () => {
    expect(read("[[:/images/a.png]] [[:/movies/demo.mp4]]")).toEqual([
      { type: "image", src: "/images/a.png", large: true },
      { type: "text", value: " " },
      { type: "video", src: "/movies/demo.mp4", large: true },
    ])
  })

  it("[[:/…]] の音声は大きくならず、太字の中のリンクになる", () => {
    expect(read("[[:/audio/bgm.mp3]]")[0]).toMatchObject({ type: "decoration", bold: true })
  })

  it("サイトの base を前に付ける。末尾の / は 1 つにまとめる", () => {
    expect(read("[:/images/a.png]", { base: "/docs/" })).toEqual([
      { type: "image", src: "/docs/images/a.png" },
    ])
  })

  it("メディアでないファイルは、ページへのリンクのまま", () => {
    expect(read("[:/files/a.pdf]")).toEqual([
      { type: "internalLink", label: ":/files/a.pdf", target: ":/files/a.pdf" },
    ])
  })

  it("装飾の中では、URL の画像と同じくリンクのまま", () => {
    expect(read("[* [:/images/a.png]]")[0]).toMatchObject({
      type: "decoration",
      children: [{ type: "internalLink", target: ":/images/a.png" }],
    })
  })
})
