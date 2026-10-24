import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { csnCssOf } from "./csn"

const packageDir = join(import.meta.dirname, "..")

describe("csn.css", () => {
  it("style.css から作り直したものと同じ (style.css を直したら bun run generate で作り直す)", async () => {
    const [styleCss, csnCss] = await Promise.all([
      readFile(join(packageDir, "style.css"), "utf8"),
      readFile(join(packageDir, "csn.css"), "utf8"),
    ])
    expect(csnCss).toBe(csnCssOf(styleCss))
  })
})
