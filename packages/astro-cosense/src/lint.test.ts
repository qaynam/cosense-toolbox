import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import type { ParseOptions } from "@cosense-toolbox/parser"
import { customDecorations } from "@cosense-toolbox/parser/extensions"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { type CosenseLintOptions, lintSite } from "./lint"

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "cosense-lint-"))
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => {
      await mkdir(dirname(join(root, name)), { recursive: true })
      await writeFile(join(root, name), text, "utf8")
    }),
  )
  return root
}

/** The lint of a project at `root`, whose pages are under `src`. */
const lint = (root: string, options: CosenseLintOptions, parseOptions: ParseOptions = {}) =>
  Effect.runPromise(lintSite(root, join(root, "src"), options, parseOptions))

describe("lintSite", () => {
  it("reports each link to a missing page under src, as a warning by default", async () => {
    const root = await project({ "src/content/a.csn": "投稿\n[無いページ]" })
    expect(await lint(root, {})).toEqual({
      errors: [],
      warnings: ["src/content/a.csn:2:1 リンク先のページが見つからない: [無いページ]"],
    })
  })

  it("counts them as errors when told to, so the build can stop", async () => {
    const root = await project({ "src/content/a.csn": "投稿\n[無いページ]" })
    expect(await lint(root, { unresolvedLinks: "error" })).toEqual({
      errors: ["src/content/a.csn:2:1 リンク先のページが見つからない: [無いページ]"],
      warnings: [],
    })
  })

  it("finds pages anywhere under src, in content and pages alike", async () => {
    const root = await project({
      "src/content/a.csn": "投稿\n[概要]",
      "src/pages/about.csnx": "概要\n中身",
    })
    expect(await lint(root, { unresolvedLinks: "error" })).toEqual({ errors: [], warnings: [] })
  })

  it("reads notation with the site's own parse options", async () => {
    const root = await project({ "src/a.csn": "投稿\n[! 注意]" })
    const parseOptions = { extensions: [customDecorations(["!"])] }
    expect(await lint(root, { unresolvedLinks: "error" }, parseOptions)).toEqual({
      errors: [],
      warnings: [],
    })
  })

  it("reports nothing when off", async () => {
    const root = await project({ "src/a.csn": "投稿\n[無いページ]" })
    expect(await lint(root, { unresolvedLinks: "off" })).toEqual({ errors: [], warnings: [] })
  })
})
