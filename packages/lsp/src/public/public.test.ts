/**
 * The entries a user imports (`@cosense-toolbox/lsp/link` and so on) hand out plain values:
 * null where the modules inside answer None, and a Promise where they answer an Effect.
 * What each answer is has tests of its own beside those modules; these are about the hand-over.
 */
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import type { Index } from "../workspace"
import { checkSite, runCheck } from "./check"
import { definitionOf, detectCompletion, detectCompletionInDocument } from "./completion"
import { linkAt } from "./link"
import { mediaFilesIn } from "./media"
import { fenceOf, frontmatterEnd } from "./tokens"

const siteWith = async (name: string, text: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "csn-public-"))
  await writeFile(join(root, name), text, "utf8")
  return root
}

describe("linkAt", () => {
  it("is the link under the cursor", () => {
    expect(linkAt("T\n[設計メモ]", { line: 1, character: 2 })).toMatchObject({
      kind: "page",
      title: "設計メモ",
    })
  })

  it("is null where there is no link", () => {
    expect(linkAt("T\n本文", { line: 1, character: 1 })).toBeNull()
  })
})

describe("detectCompletion", () => {
  it("is what is being typed in a link", () => {
    expect(detectCompletion("[ページ]", 2)).toMatchObject({ kind: "link", query: "ページ" })
  })

  it("is null outside a link or a tag", () => {
    expect(detectCompletion("本文", 1)).toBeNull()
  })
})

describe("detectCompletionInDocument", () => {
  it("is what is being typed in a link of the body", () => {
    expect(detectCompletionInDocument("T\n[ページ]", { line: 1, character: 2 })).toMatchObject({
      kind: "link",
    })
  })

  it("is null on the title line", () => {
    expect(detectCompletionInDocument("[ページ]", { line: 0, character: 2 })).toBeNull()
  })
})

describe("definitionOf", () => {
  const index: Index = {
    pages: [{ title: "設計メモ", uri: "file:///w/design.csn", location: "design.csn" }],
  }

  it("is the file of the page a link names", () => {
    expect(definitionOf(index, "T\n[設計メモ]", { line: 1, character: 2 })).toMatchObject({
      uri: "file:///w/design.csn",
    })
  })

  it("is null for a page no file holds", () => {
    expect(definitionOf(index, "T\n[無いページ]", { line: 1, character: 2 })).toBeNull()
  })
})

describe("frontmatterEnd and fenceOf", () => {
  const lines = ["---", "title: a", "---", "本文"]

  it("are the line that closes the --- fence", () => {
    expect(frontmatterEnd(lines)).toBe(2)
    expect(fenceOf(lines, true)).toBe(2)
  })

  it("are null where there is no fence to skip", () => {
    expect(frontmatterEnd(["本文"])).toBeNull()
    expect(fenceOf(lines, false)).toBeNull()
  })
})

describe("mediaFilesIn", () => {
  it("resolves to the site paths of the files", async () => {
    const root = await siteWith("a.png", "")

    await expect(mediaFilesIn(root)).resolves.toEqual(["/a.png"])
  })
})

describe("checkSite", () => {
  it("resolves to the reports", async () => {
    const root = await siteWith("a.csn", "投稿\n[無いページ]")

    await expect(checkSite({ roots: [root], unresolvedLinks: "error" })).resolves.toMatchObject([
      { level: "error", line: 2 },
    ])
  })
})

describe("runCheck", () => {
  it("resolves to the output and the exit code", async () => {
    const root = await siteWith("a.csn", "投稿\n本文")

    await expect(runCheck([], root)).resolves.toEqual({ output: "", exitCode: 0 })
  })
})
