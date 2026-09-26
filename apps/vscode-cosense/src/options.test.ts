import { describe, expect, it } from "vitest"

import { initializationOptionsOf, serverModuleOf } from "./options"

/** A `cosense.*` setting reader over fixed values, as VS Code's configuration would give. */
const settings =
  (values: Record<string, unknown>) =>
  (key: string): unknown =>
    values[key]

describe("initializationOptionsOf", () => {
  it("hands the server every setting the user made, under the server's own names", () => {
    expect(
      initializationOptionsOf(
        settings({
          sources: ["src"],
          decorations: ["!"],
          unresolvedLinks: "error",
          frontmatter: false,
        }),
      ),
    ).toEqual({
      sources: ["src"],
      decorations: ["!"],
      unresolvedLinks: "error",
      frontmatter: false,
    })
  })

  it("leaves out what is not set, so the server's defaults apply", () => {
    expect(initializationOptionsOf(settings({ unresolvedLinks: "warning" }))).toEqual({
      unresolvedLinks: "warning",
    })
  })
})

describe("serverModuleOf", () => {
  it("runs the server bundled with the extension by default", () => {
    expect(serverModuleOf(undefined, "/ext")).toBe("/ext/dist/server.mjs")
    expect(serverModuleOf("", "/ext")).toBe("/ext/dist/server.mjs")
  })

  it("runs the server at the path the user set instead", () => {
    expect(serverModuleOf("/repo/packages/lsp/dist/main.mjs", "/ext")).toBe(
      "/repo/packages/lsp/dist/main.mjs",
    )
  })
})
