import { describe, expect, it } from "vitest"

import { tokenizeInline } from "../inline/tokenize"
import type { LocationNode } from "../types"
import { asMapUrl } from "./map-url"

/** 角括弧で囲んだ座標を読んだ地図のノード。 */
const location = (inner: string): LocationNode => {
  const [node] = tokenizeInline(`[${inner}]`)
  if (node?.type !== "location") throw new Error(`${inner} は地図にならない`)
  return node
}

describe("asMapUrl", () => {
  it("座標だけの地図は、その場所の Google マップの URL になる", () => {
    expect(asMapUrl(location("N35.6812,E139.7671"))).toBe(
      "https://www.google.com/maps/place/35.6812,139.7671",
    )
  })

  it("ズームがあれば、その縮尺で開く", () => {
    expect(asMapUrl(location("S33.86,W151.2,Z12"))).toBe(
      "https://www.google.com/maps/place/-33.86,-151.2/@-33.86,-151.2,12z",
    )
  })

  it("ラベルがあれば、その名前で検索する", () => {
    expect(asMapUrl(location("N35.6812,E139.7671 東京駅"))).toBe(
      "https://www.google.com/maps/search/%E6%9D%B1%E4%BA%AC%E9%A7%85/@35.6812,139.7671,15z",
    )
  })

  it("ラベルとズームがあれば、その縮尺で検索する", () => {
    expect(asMapUrl(location("東京駅 N35.6812,E139.7671,Z18"))).toBe(
      "https://www.google.com/maps/search/%E6%9D%B1%E4%BA%AC%E9%A7%85/@35.6812,139.7671,18z",
    )
  })
})
