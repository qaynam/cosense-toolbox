import type { Extension } from "@cosense-toolbox/parser/extensions"
import { Option } from "effect"
import { describe, expect, it } from "vitest"

import { linkAt, type LinkTarget } from "./link"

/**
 * What `linkAt` finds with the cursor just after the first character of `needle` on the
 * second line of `T\n{line}`, without its range (the range has tests of its own).
 */
const targetAt = (line: string, needle: string, parseOptions = {}) =>
  Option.getOrUndefined(
    Option.map(
      linkAt(`T\n${line}`, { line: 1, character: line.indexOf(needle) + 1 }, parseOptions),
      ({ range: _, ...target }) => target,
    ),
  )

const IMAGE = "https://example.invalid/a.png"
const PAGE = "https://example.invalid/about"
const VIDEO = "https://example.invalid/a.mp4"
const SOUND = "https://example.invalid/a.mp3"

describe("linkAt", () => {
  it("finds the page a link names", () => {
    expect(targetAt("[設計メモ]", "設計")).toEqual({ kind: "page", title: "設計メモ" })
  })

  it("finds the page a tag names", () => {
    expect(targetAt("本文 #設計メモ", "#")).toEqual({ kind: "page", title: "設計メモ" })
  })

  it("finds a page of another project with that project", () => {
    expect(targetAt("[/help-jp/ページ]", "help")).toEqual({
      kind: "page",
      project: "help-jp",
      title: "ページ",
    })
  })

  it("finds the page of the user an icon shows", () => {
    expect(targetAt("[taro.icon]", "taro")).toEqual({ kind: "page", title: "taro" })
  })

  it("finds the same page however many times the icon repeats", () => {
    expect(targetAt("[taro.icon*3]", "taro")).toEqual({ kind: "page", title: "taro" })
  })

  it("finds the page of an icon from another project with that project", () => {
    expect(targetAt("[/icons/taro.icon]", "icons")).toEqual({
      kind: "page",
      project: "icons",
      title: "taro",
    })
  })

  it("finds the page of a large icon, which the parser reads as bold", () => {
    expect(targetAt("[[taro.icon]]", "taro")).toEqual({ kind: "page", title: "taro" })
  })

  it("does not read bold text that looks like an icon as one", () => {
    expect(targetAt("[* taro.icon]", "taro")).toBeUndefined()
  })

  it("finds a line of a page when the link ends in # and a line id", () => {
    expect(targetAt("[設計メモ#0123456789abcdef01234567]", "設計")).toEqual({
      kind: "page",
      title: "設計メモ",
      lineId: "0123456789abcdef01234567",
    })
  })

  it("reads a # that is not followed by a line id as part of the title", () => {
    expect(targetAt("[C#入門]", "C")).toEqual({ kind: "page", title: "C#入門" })
  })

  it("finds the URL of an external link", () => {
    expect(targetAt(`[${PAGE}]`, PAGE)).toEqual({ kind: "url", url: PAGE })
  })

  it("finds the URL of an external link with a label", () => {
    expect(targetAt(`[ラベル ${PAGE}]`, "ラベル")).toEqual({ kind: "url", url: PAGE })
  })

  it("finds where an image with a link leads, not the image", () => {
    expect(targetAt(`[${IMAGE} ${PAGE}]`, IMAGE)).toEqual({ kind: "url", url: PAGE })
  })

  it("finds the image itself when it leads nowhere", () => {
    expect(targetAt(`[${IMAGE}]`, IMAGE)).toEqual({ kind: "url", url: IMAGE })
  })

  it("finds where a video with a link leads, not the video", () => {
    expect(targetAt(`[${PAGE} ${VIDEO}]`, PAGE)).toEqual({ kind: "url", url: PAGE })
  })

  it("finds the video itself when it leads nowhere", () => {
    expect(targetAt(`[${VIDEO}]`, VIDEO)).toEqual({ kind: "url", url: VIDEO })
  })

  it("finds the file of a sound, from its label too", () => {
    expect(targetAt(`[BGM ${SOUND}]`, "BGM")).toEqual({ kind: "url", url: SOUND })
  })

  it("finds the URL an embedded player was written with", () => {
    expect(targetAt("[https://vimeo.com/123]", "https")).toEqual({
      kind: "url",
      url: "https://vimeo.com/123",
    })
  })

  it("finds the map a location opens", () => {
    expect(targetAt("[N35.68,E139.76,Z14]", "N")).toEqual({
      kind: "url",
      url: "https://www.google.com/maps/place/35.68,139.76/@35.68,139.76,14z",
    })
  })

  it("finds a link inside a decoration", () => {
    expect(targetAt("[! [設計メモ]です]", "設計")).toEqual({ kind: "page", title: "設計メモ" })
  })

  it("finds nothing on plain text", () => {
    expect(targetAt("ただの文章 [設計メモ]", "文章")).toBeUndefined()
  })

  it("finds nothing on the markers of a decoration", () => {
    expect(targetAt("[! [設計メモ]です]", "!")).toBeUndefined()
  })

  it("finds nothing in the title line, which Cosense does not read as notation", () => {
    expect(Option.isNone(linkAt("[設計メモ] の話\n本文", { line: 0, character: 2 }))).toBe(true)
  })

  it("finds nothing in inline code, where a bracket is not notation", () => {
    expect(targetAt("`[設計メモ]`", "設計")).toBeUndefined()
  })

  it("reads the page with the parse options it is given", () => {
    // A site's own notation: `[@x]` is a formula, not a page.
    const atFormula: Extension = {
      bracketRules: [(inner) => (inner.startsWith("@") ? { type: "formula", value: inner } : null)],
    }
    expect(targetAt("[@x]", "@", { extensions: [atFormula] })).toBeUndefined()
  })
})

describe("linkAt, where the cursor is", () => {
  const found = (line: string, character: number): Option.Option<LinkTarget> =>
    linkAt(`T\n${line}`, { line: 1, character })

  it("gives the range of the whole notation, brackets included", () => {
    expect(Option.map(found("本文 [設計メモ]", 5), ({ range }) => range)).toEqual(
      Option.some({ start: { line: 1, character: 3 }, end: { line: 1, character: 9 } }),
    )
  })

  it("counts columns in UTF-16, as the LSP does, past an emoji", () => {
    // 😀 is two UTF-16 units, so the link starts at 2.
    expect(Option.map(found("😀[設計メモ]", 3), ({ range }) => range.start.character)).toEqual(
      Option.some(2),
    )
  })

  it("finds the notation from its first character", () => {
    expect(Option.isSome(found("[設計メモ]", 0))).toBe(true)
  })

  it("finds the notation from just after its last character, where typing leaves the cursor", () => {
    expect(Option.isSome(found("#設計メモ", 5))).toBe(true)
  })

  it("finds the second of two notations that touch, from where it starts", () => {
    expect(
      Option.map(found("[前][後]", 3), (target) => target.kind === "page" && target.title),
    ).toEqual(Option.some("後"))
  })
})
