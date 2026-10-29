import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { idOf, isCosenseFile, scanSite } from "./site"

const FILES: Record<string, string> = {
  "src/content/posts/a.csn": "Page A\n[Page B] と [Page C]",
  "src/content/posts/b.csn": "Page B\n#タグ",
  "src/content/posts/notes/c.csnx": "Page C\n<Counter />\n[page_a]",
  "src/content/posts/draft.csn": "---\ndraft: true\n---\n下書き\n[Page A]",
  "src/pages/about.csnx": "About\n[Page A]",
  "content/notes/d.csn": "Page D\n[Page A]",
  "src/content/posts/readme.md": "# 対象外",
  "node_modules/pkg/x.csn": "対象外",
}

const projectOf = async (files: Record<string, string>): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "cosense-astro-"))
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true })
    await writeFile(join(directory, path), source)
  }
  return directory
}

let root: string

beforeAll(async () => {
  root = await projectOf(FILES)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("scanSite", () => {
  it("ルートの下の .csn / .csnx を、ルートからの相対パスを id にして索引に載せる", async () => {
    const { index } = await scanSite(root)
    expect(Object.keys(index.pages).sort()).toEqual([
      "content/notes/d.csn",
      "src/content/posts/a.csn",
      "src/content/posts/b.csn",
      "src/content/posts/notes/c.csnx",
      "src/pages/about.csnx",
    ])
  })

  it("グラフの逆リンクは、src の外と src/pages のページも含む", async () => {
    const { graph } = await scanSite(root)
    expect(graph.backlinks["src/content/posts/a.csn"]).toEqual([
      "content/notes/d.csn",
      "src/content/posts/notes/c.csnx",
      "src/pages/about.csnx",
    ])
    expect(graph.backlinks["src/content/posts/notes/c.csnx"]).toEqual(["src/content/posts/a.csn"])
  })

  it("LSP と同じく、node_modules・dist・build と . で始まるディレクトリは読まない", async () => {
    const project = await projectOf({
      "src/a.csn": "A",
      "node_modules/pkg/x.csn": "X",
      "dist/x.csn": "X",
      "build/x.csn": "X",
      ".vercel/output/x.csn": "X",
    })
    const { index } = await scanSite(project)
    expect(Object.keys(index.pages)).toEqual(["src/a.csn"])
    await rm(project, { recursive: true, force: true })
  })

  it("ディレクトリが無ければ空のサイトになる", async () => {
    const { index } = await scanSite(join(root, "missing"))
    expect(index.pages).toEqual({})
  })
})

describe("idOf / isCosenseFile", () => {
  it("id は区切りを / にしたルートからの相対パス", () => {
    expect(idOf("/project", "/project/src/a.csn")).toBe("src/a.csn")
  })

  it(".csn と .csnx だけを対象にする", () => {
    expect(["a.csn", "a.csnx", "a.md", "a.csn.bak"].map(isCosenseFile)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })
})
