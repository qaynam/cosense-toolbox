import { Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  iconSetUrls,
  iconsOfCollection,
  iconSvg,
  libraryOfIcon,
  matchesQuery,
  withDefaultsFirst,
} from "./icon-libraries"

describe("iconSetUrls", () => {
  it("prefix ごとに 1 つの URL にまとめ、名前を並べる", () => {
    expect(iconSetUrls(["tabler:check", "twemoji:star", "tabler:x"])).toEqual([
      "https://api.iconify.design/tabler.json?icons=check,x",
      "https://api.iconify.design/twemoji.json?icons=star",
    ])
  })
})

describe("iconSvg", () => {
  const set = {
    prefix: "test",
    width: 24,
    height: 24,
    icons: {
      mono: { body: '<path fill="currentColor" d="M0 0h24v24H0z"/>' },
      emoji: { body: '<path fill="#ffac33" d="M0 0h24v24H0z"/>' },
    },
  }

  it("単色のアイコンは指定の色で塗る", () => {
    const svg = Option.getOrThrow(iconSvg(set, "test:mono", "#2f9bf0"))

    expect(svg).toContain('fill="#2f9bf0"')
    expect(svg).not.toContain("currentColor")
  })

  it("色を持つアイコンは、その色のまま", () => {
    expect(Option.getOrThrow(iconSvg(set, "test:emoji", "#2f9bf0"))).toContain('fill="#ffac33"')
  })

  it("高さ 128 で描く", () => {
    expect(Option.getOrThrow(iconSvg(set, "test:mono", "#000"))).toContain('height="128"')
  })

  it("JSON に無いアイコンは無い", () => {
    expect(Option.isNone(iconSvg(set, "test:missing", "#000"))).toBe(true)
  })
})

describe("iconsOfCollection", () => {
  it("分類なしと各分類のアイコンを、prefix を付けて 1 つに並べる", () => {
    expect(
      iconsOfCollection({
        prefix: "fa-solid",
        uncategorized: ["a"],
        categories: { Arrows: ["b", "c"], Media: ["d"] },
      }),
    ).toEqual(["fa-solid:a", "fa-solid:b", "fa-solid:c", "fa-solid:d"])
  })

  it("2 つの分類に入っているアイコンは 1 度だけ", () => {
    expect(iconsOfCollection({ prefix: "t", categories: { A: ["x"], B: ["x", "y"] } })).toEqual([
      "t:x",
      "t:y",
    ])
  })
})

describe("withDefaultsFirst", () => {
  it("よく使うアイコンを先に並べ、残りから同じものを除く", () => {
    expect(withDefaultsFirst(["t:c", "t:a"], ["t:a", "t:b", "t:c"])).toEqual(["t:c", "t:a", "t:b"])
  })

  it("一覧に無いよく使うアイコンは並べない", () => {
    expect(withDefaultsFirst(["t:gone"], ["t:a"])).toEqual(["t:a"])
  })
})

describe("matchesQuery", () => {
  it("言葉が名前のどこかに入っていれば合う", () => {
    expect(matchesQuery("tabler:circle-check-filled", "check")).toBe(true)
  })

  it("空白で区切った言葉は、すべて入っていないと合わない", () => {
    expect(matchesQuery("tabler:circle-check-filled", "circle fill")).toBe(true)
    expect(matchesQuery("tabler:circle-check-filled", "circle star")).toBe(false)
  })

  it("prefix では探さない", () => {
    expect(matchesQuery("tabler:check", "tabler")).toBe(false)
  })

  it("大文字でも探せる", () => {
    expect(matchesQuery("tabler:check", "CHECK")).toBe(true)
  })
})

describe("libraryOfIcon", () => {
  it("prefix が分かれている集まりも、どの prefix から引いても同じ集まりになる", () => {
    expect(libraryOfIcon("fa-regular:smile")?.id).toBe("font-awesome-5")
    expect(libraryOfIcon("fa-solid:smile")?.id).toBe("font-awesome-5")
  })

  it("知らない prefix の集まりは無い", () => {
    expect(libraryOfIcon("mdi:check")).toBeUndefined()
  })
})
