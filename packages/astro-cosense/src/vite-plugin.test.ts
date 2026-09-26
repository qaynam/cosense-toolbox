import { describe, expect, it } from "vitest"

import { compileOptionsOf } from "./vite-plugin"

describe("compileOptionsOf", () => {
  it("renders a link to a missing page as the integration's unresolvedLinks says", () => {
    expect(compileOptionsOf({ unresolvedLinks: "link" })).toEqual({ unresolved: "link" })
  })

  it("leaves the compile default in place when unresolvedLinks is not set", () => {
    expect(compileOptionsOf({})).toEqual({})
  })

  it("passes every other compile option through as it is", () => {
    const tagUrl = (tag: string) => `/tags/${tag}`
    expect(compileOptionsOf({ tagUrl, unresolvedLinks: "text" })).toEqual({
      tagUrl,
      unresolved: "text",
    })
  })
})
