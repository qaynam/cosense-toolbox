import { Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  type Badge,
  BADGE_FONTS,
  BADGE_HEIGHT,
  badgeFontOf,
  googleFontsUrl,
  layoutBadge,
  scaledSize,
  weightOf,
} from "./badge"

const badge = (overrides: Partial<Badge> = {}): Badge => ({
  text: "済",
  font: "noto-sans-jp",
  bold: true,
  italic: false,
  icon: Option.none(),
  shape: "rounded",
  background: "#ffffff",
  foreground: "#111111",
  ...overrides,
})

const check = Option.some("tabler:circle-check-filled")

describe("layoutBadge", () => {
  it("高さはいつも同じで、幅は文字の幅に合わせて伸びる", () => {
    const short = layoutBadge(badge(), 100)
    const long = layoutBadge(badge(), 300)

    expect(short.height).toBe(BADGE_HEIGHT)
    expect(long.height).toBe(BADGE_HEIGHT)
    expect(long.width - short.width).toBe(200)
  })

  it("背景なしは余白を詰めて、背景ありより幅が狭い", () => {
    const filled = layoutBadge(badge({ shape: "square" }), 100)
    const plain = layoutBadge(badge({ shape: "plain" }), 100)

    expect(plain.width).toBeLessThan(filled.width)
  })

  it("丸は角の半径が高さの半分で、四角は角が無い", () => {
    expect(layoutBadge(badge({ shape: "pill" }), 100).radius).toBe(BADGE_HEIGHT / 2)
    expect(layoutBadge(badge({ shape: "square" }), 100).radius).toBe(0)
  })

  it("アイコンを付けると、アイコンの後ろから文字が始まる", () => {
    const withoutIcon = layoutBadge(badge(), 100)
    const withIcon = layoutBadge(badge({ icon: check }), 100)

    const icon = Option.getOrThrow(withIcon.icon)
    expect(withIcon.textX).toBeGreaterThan(icon.x + icon.size)
    expect(withIcon.textX).toBeGreaterThan(withoutIcon.textX)
  })

  it("アイコンは上下の真ん中に置く", () => {
    const icon = Option.getOrThrow(layoutBadge(badge({ icon: check }), 100).icon)

    expect(icon.y + icon.size / 2).toBe(BADGE_HEIGHT / 2)
  })

  it("背景なしのアイコンは、背景の内側に収めるアイコンより大きい", () => {
    const filled = Option.getOrThrow(layoutBadge(badge({ icon: check }), 100).icon)
    const plain = Option.getOrThrow(layoutBadge(badge({ icon: check, shape: "plain" }), 100).icon)

    expect(plain.size).toBeGreaterThan(filled.size)
  })

  it("アイコンだけなら、アイコンを左右の真ん中に置く", () => {
    const layout = layoutBadge(badge({ text: "", icon: check }), 0)
    const icon = Option.getOrThrow(layout.icon)

    expect(icon.x + icon.size / 2).toBe(layout.width / 2)
  })

  it("アイコンが無ければアイコンの位置も無い", () => {
    expect(Option.isNone(layoutBadge(badge(), 100).icon)).toBe(true)
  })

  it("斜体は傾いた分だけ右に幅を足す", () => {
    const upright = layoutBadge(badge(), 100)
    const italic = layoutBadge(badge({ italic: true }), 100)

    expect(italic.width).toBeGreaterThan(upright.width)
  })
})

describe("scaledSize", () => {
  // 角丸の左右の余白は 28 ずつなので、文字の幅 200 で幅 256 になる
  const layout = layoutBadge(badge(), 200)

  it("縦横の比を保ったまま、指定の高さに縮める", () => {
    expect(scaledSize(layout, 64)).toEqual({ width: 128, height: 64 })
  })

  it("割り切れない幅は切り上げる", () => {
    // 文字の幅 100 で幅 156。156 × 48/128 = 58.5
    expect(scaledSize(layoutBadge(badge(), 100), 48)).toEqual({ width: 59, height: 48 })
  })
})

describe("フォント", () => {
  const twoWeights = { id: "a", label: "a", family: "Zen Maru Gothic", weights: [400, 700] }
  const oneWeight = { id: "b", label: "b", family: "Dela Gothic One", weights: [400] }

  it("太字は一番太い太さ、太字でなければ一番細い太さで描く", () => {
    expect(weightOf(twoWeights, true)).toBe(700)
    expect(weightOf(twoWeights, false)).toBe(400)
  })

  it("太さが 1 つしかないフォントは、太字でも同じ太さ", () => {
    expect(weightOf(oneWeight, true)).toBe(400)
  })

  it("Google Fonts からは、名前の空白を + にして、すべての太さを読む", () => {
    expect(googleFontsUrl(twoWeights)).toBe(
      "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;700&display=swap",
    )
  })

  it("知らない id は最初のフォントにする", () => {
    expect(badgeFontOf("unknown")).toBe(BADGE_FONTS[0])
  })
})
