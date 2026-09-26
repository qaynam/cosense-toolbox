import { parse } from "@cosense-toolbox/parser"
import { collect } from "@cosense-toolbox/parser/utils"
import { describe, expect, it } from "vitest"

import { defaultSettings, parseOptionsOf, settingsOf } from "./settings"

describe("settingsOf", () => {
  it("reads every setting the editor sends", () => {
    expect(
      settingsOf({
        sources: ["examples/astro-blog/src"],
        decorations: ["|", "!"],
        unresolvedLinks: "error",
      }),
    ).toEqual({
      sources: ["examples/astro-blog/src"],
      decorations: ["|", "!"],
      unresolvedLinks: "error",
    })
  })

  it("falls back to the defaults when there are no options", () => {
    expect(settingsOf(undefined)).toEqual(defaultSettings)
    expect(defaultSettings).toEqual({ sources: [], decorations: [], unresolvedLinks: "warning" })
  })

  it("keeps the strings of a list and drops what is not one", () => {
    expect(settingsOf({ sources: "src", decorations: ["!", 1, ""] })).toEqual({
      ...defaultSettings,
      decorations: ["!"],
    })
  })
})

describe("parseOptionsOf", () => {
  const linksIn = (text: string, decorations: ReadonlyArray<string>) =>
    collect(parse(text, parseOptionsOf({ ...defaultSettings, decorations })), "internalLink").map(
      (link) => link.target,
    )

  it("reads a bracket opened by a listed marker as a decoration, not a link", () => {
    expect(linksIn("T\n[! 注意] [ページ]", ["!"])).toEqual(["ページ"])
  })

  it("reads it as a link when the marker is not listed, as the parser does", () => {
    expect(linksIn("T\n[! 注意]", [])).toEqual(["! 注意"])
  })
})
