import { describe, expect, it } from "vitest"

import { tokenizeInline } from "../inline/tokenize"
import type { EmbedNode } from "../types"
import { asEmbedSrc } from "./media-url"

/** 角括弧で囲んだ URL を読んだ埋め込みのノード。 */
const embed = (url: string): EmbedNode => {
  const [node] = tokenizeInline(`[${url}]`)
  if (node?.type !== "embed") throw new Error(`${url} は埋め込みにならない`)
  return node
}

describe("asEmbedSrc", () => {
  it("YouTube の動画は embed の URL になる", () => {
    expect(asEmbedSrc(embed("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    )
  })

  it("YouTube の開始位置は秒にして start で渡す", () => {
    expect(asEmbedSrc(embed("https://youtu.be/dQw4w9WgXcQ?t=1m30s"))).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=90",
    )
  })

  it("YouTube の開始位置は数字だけでもよい", () => {
    expect(asEmbedSrc(embed("https://www.youtube.com/watch?v=abc&t=42"))).toBe(
      "https://www.youtube.com/embed/abc?start=42",
    )
  })

  it("YouTube の動画に付いた再生リストは引き継ぐ", () => {
    expect(asEmbedSrc(embed("https://www.youtube.com/watch?v=abc&list=PLx"))).toBe(
      "https://www.youtube.com/embed/abc?list=PLx",
    )
  })

  it("YouTube の再生リストは videoseries の URL になる", () => {
    expect(asEmbedSrc(embed("https://www.youtube.com/playlist?list=PLabc"))).toBe(
      "https://www.youtube.com/embed/videoseries?list=PLabc",
    )
  })

  it("YouTube のショートも同じ embed の URL になる", () => {
    expect(asEmbedSrc(embed("https://www.youtube.com/shorts/abc"))).toBe(
      "https://www.youtube.com/embed/abc",
    )
  })

  it("Vimeo の動画はプレーヤーの URL になる", () => {
    expect(asEmbedSrc(embed("https://vimeo.com/123456"))).toBe(
      "https://player.vimeo.com/video/123456",
    )
  })

  it("限定公開の Vimeo の動画はハッシュを h で渡す", () => {
    expect(asEmbedSrc(embed("https://vimeo.com/123456/abcdef"))).toBe(
      "https://player.vimeo.com/video/123456?h=abcdef",
    )
  })

  it("Spotify は種類と ID から embed の URL になる", () => {
    expect(asEmbedSrc(embed("https://open.spotify.com/intl-ja/album/abc?si=x"))).toBe(
      "https://open.spotify.com/embed/album/abc",
    )
  })

  it("Spotify for Podcasters のエピソードは anchor.fm の embed の URL になる", () => {
    expect(asEmbedSrc(embed("https://podcasters.spotify.com/pod/show/show/episodes/ep-abc"))).toBe(
      "https://anchor.fm/show/embed/episodes/ep-abc",
    )
  })

  it("Cosense Web が埋め込まないサービスは null", () => {
    const node: EmbedNode = { ...embed("https://vimeo.com/1"), provider: "figma" }
    expect(asEmbedSrc(node)).toBeNull()
  })
})
