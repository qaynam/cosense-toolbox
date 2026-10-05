import { Option } from "effect"
import { describe, expect, it } from "vitest"

import { type Badge, BADGE_HEIGHT, layoutBadge } from "./badge"

const badge = (overrides: Partial<Badge> = {}): Badge => ({
  text: "済",
  shape: "rounded",
  mark: "none",
  background: "#ffffff",
  foreground: "#111111",
  italic: false,
  ...overrides,
})

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

  it("記号を付けると、記号の後ろから文字が始まる", () => {
    const withoutMark = layoutBadge(badge(), 100)
    const withMark = layoutBadge(badge({ mark: "check" }), 100)

    const mark = Option.getOrThrow(withMark.mark)
    expect(withMark.textX).toBeGreaterThan(mark.x + mark.radius)
    expect(withMark.textX).toBeGreaterThan(withoutMark.textX)
  })

  it("記号だけなら、記号を左右の真ん中に置く", () => {
    const layout = layoutBadge(badge({ text: "", mark: "check" }), 0)

    expect(Option.getOrThrow(layout.mark).x).toBe(layout.width / 2)
  })

  it("記号が無ければ記号の位置も無い", () => {
    expect(Option.isNone(layoutBadge(badge(), 100).mark)).toBe(true)
  })

  it("斜体は傾いた分だけ右に幅を足す", () => {
    const upright = layoutBadge(badge(), 100)
    const italic = layoutBadge(badge({ italic: true }), 100)

    expect(italic.width).toBeGreaterThan(upright.width)
  })
})
