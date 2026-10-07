/**
 * `./schema` サブパスの仕様。保存や受け渡しを跨いで戻ってきた JSON が
 * 本当に Page かを検証したい利用者向けの API。
 */
import { Either } from "effect"
import { describe, expect, it } from "vitest"

import { parse } from "./parse"
import { decodePage, isPage } from "./schema"

const roundTrip = (source: string) => JSON.parse(JSON.stringify(parse(source)))

describe("decodePage", () => {
  it("パース結果は JSON を往復しても Page として受理される", () => {
    const decoded = decodePage(roundTrip("タイトル\n[* [リンク]] と #tag\ncode:a.ts\n x"))
    expect(Either.isRight(decoded)).toBe(true)
  })

  it("動画・音声・埋め込みの入ったパース結果も受理される", () => {
    const source =
      "タイトル\n[[https://x.com/a.mp4]] [https://x.com/a.mp3 BGM] [https://vimeo.com/1] [https://youtu.be/a]"
    const decoded = decodePage(roundTrip(source))
    expect(Either.getOrThrow(decoded)).toEqual(parse(source))
  })

  it("地図の入ったパース結果も受理される", () => {
    const source = "タイトル\n[N35.68,E139.76,Z14 東京駅] [S33.86,W151.2]"
    const decoded = decodePage(roundTrip(source))
    expect(Either.getOrThrow(decoded)).toEqual(parse(source))
  })

  it("受理した値は元の AST と等しい", () => {
    const source = "タイトル\n[リンク]"
    const decoded = decodePage(roundTrip(source))
    expect(Either.getOrThrow(decoded)).toEqual(parse(source))
  })

  it("Page でない値は拒否する", () => {
    expect(Either.isLeft(decodePage({ type: "page" }))).toBe(true)
    expect(Either.isLeft(decodePage(null))).toBe(true)
    expect(Either.isLeft(decodePage({ type: "notAPage", children: [], position: null }))).toBe(true)
  })

  it("ノードの形が違えば拒否する", () => {
    const broken = roundTrip("タイトル")
    broken.children[0].value = 42
    expect(Either.isLeft(decodePage(broken))).toBe(true)
  })

  it("位置情報が欠けていれば拒否する", () => {
    const broken = roundTrip("タイトル\n本文")
    broken.children[1].position = undefined
    expect(Either.isLeft(decodePage(broken))).toBe(true)
  })
})

describe("isPage", () => {
  it("パース結果は JSON を往復しても Page とみなす", () => {
    expect(isPage(roundTrip("タイトル\n[* [リンク]] と #tag\ncode:a.ts\n x"))).toBe(true)
  })

  it("Page でない値は Page とみなさない", () => {
    expect(isPage({ type: "page" })).toBe(false)
    expect(isPage(null)).toBe(false)
  })

  it("位置情報が欠けていれば Page とみなさない", () => {
    const broken = roundTrip("タイトル\n本文")
    broken.children[1].position = undefined
    expect(isPage(broken)).toBe(false)
  })
})
