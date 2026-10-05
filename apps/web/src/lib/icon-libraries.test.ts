import { Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  ICON_LIBRARIES,
  iconSearchUrl,
  iconSetUrls,
  iconSvg,
  libraryOfIcon,
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

describe("iconSearchUrl", () => {
  it("集まりのすべての prefix から探す", () => {
    const fontAwesome = ICON_LIBRARIES.find(({ id }) => id === "font-awesome-5")!

    expect(iconSearchUrl(fontAwesome, "check circle")).toBe(
      "https://api.iconify.design/search?query=check%20circle&prefixes=fa-solid,fa-regular&limit=64",
    )
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
