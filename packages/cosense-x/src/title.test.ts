import { describe, expect, it } from "vitest"

import { normalizeTitle, titleToSlug } from "./title"

describe("normalizeTitle", () => {
  it("大文字小文字を区別しない", () => {
    expect(normalizeTitle("JavaScript")).toBe(normalizeTitle("javascript"))
  })

  it("空白と _ を同一視する", () => {
    expect(normalizeTitle("Hello World")).toBe(normalizeTitle("hello_world"))
  })

  it("前後の空白は無視する", () => {
    expect(normalizeTitle("  foo ")).toBe(normalizeTitle("foo"))
  })
})

describe("titleToSlug", () => {
  it("空白を _ にする", () => {
    expect(titleToSlug("Hello World")).toBe("Hello_World")
  })

  it("URL の区切りになる文字は - にする", () => {
    expect(titleToSlug("a/b?c#d")).toBe("a-b-c-d")
  })

  it("日本語はそのまま残す", () => {
    expect(titleToSlug("今日のメモ")).toBe("今日のメモ")
  })
})
