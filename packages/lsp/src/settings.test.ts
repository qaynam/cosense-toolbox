import { describe, expect, it } from "vitest"

import { defaultSettings, settingsOf } from "./settings"

describe("settingsOf", () => {
  it("reads every setting the editor sends", () => {
    expect(
      settingsOf({
        sources: ["examples/astro-blog/src"],
        unresolvedLinks: "error",
        frontmatter: false,
        tokenNames: "cosense",
      }),
    ).toEqual({
      sources: ["examples/astro-blog/src"],
      unresolvedLinks: "error",
      frontmatter: false,
      tokenNames: "cosense",
    })
  })

  it("falls back to the defaults when there are no options", () => {
    expect(settingsOf(undefined)).toEqual(defaultSettings)
    expect(defaultSettings).toEqual({
      sources: [],
      unresolvedLinks: "warning",
      frontmatter: true,
      tokenNames: "lsp",
    })
  })

  it("keeps the strings of a list and drops what is not one", () => {
    expect(settingsOf({ sources: ["src", 1, ""] })).toEqual({
      ...defaultSettings,
      sources: ["src"],
    })
  })

  it("falls back to the default of a setting whose value is not of its shape", () => {
    expect(settingsOf({ sources: "src", frontmatter: "no", tokenNames: "zed" })).toEqual(
      defaultSettings,
    )
  })

  it("has no setting for decoration markers, since which ones decorate is Cosense's syntax", () => {
    expect(settingsOf({ decorations: ["!"] })).toEqual(defaultSettings)
  })
})
