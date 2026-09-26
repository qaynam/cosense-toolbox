import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { readIndex, rootsOf } from "./workspace"

const workspace = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "csn-"))
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name)
    await mkdir(join(path, ".."), { recursive: true })
    await writeFile(path, text, "utf8")
  }
  return root
}

const titles = async (files: Record<string, string>): Promise<string[]> =>
  (await Effect.runPromise(readIndex([await workspace(files)]))).pages.map((p) => p.title).sort()

describe("readIndex", () => {
  it("takes the first line as the title", async () => {
    expect(await titles({ "a.csn": "はじめての投稿\n本文" })).toEqual(["はじめての投稿"])
  })

  it("ignores a title in the frontmatter, and does not read the YAML as the first line", async () => {
    // Cosense has no title apart from the text: the first line is the title, and a link
    // finds a page by it.
    const found = await titles({
      "a.csn": "---\ntitle: 別の名前\ndate: 2026-09-26\n---\n本当の題\n本文",
    })
    expect(found).toEqual(["本当の題"])
  })

  it("falls back to the file name when there is nothing to read", async () => {
    expect(await titles({ "無題.csn": "" })).toEqual(["無題"])
    expect(await titles({ "b.csn": "---\ntitle: x\n---\n" })).toEqual(["b"])
  })

  it("indexes only pages that have a file: a link to a page is not a page", async () => {
    expect(await titles({ "a.csn": "投稿\n[まだ無いページ] と #タグ" })).toEqual(["投稿"])
  })

  it("gives each page its file's uri and where it is under the root it was found in", async () => {
    const root = await workspace({ "notes/b.csnx": "メモ\n本文" })
    const [page] = (await Effect.runPromise(readIndex([root]))).pages
    expect(page?.uri).toMatch(/^file:\/\/.*\/notes\/b\.csnx$/)
    expect(page?.location).toBe("notes/b.csnx")
  })

  it("reads only under the roots it is given", async () => {
    const root = await workspace({ "src/a.csn": "中のページ", "other/b.csn": "外のページ" })
    const { pages } = await Effect.runPromise(readIndex([join(root, "src")]))
    expect(pages.map((page) => [page.title, page.location])).toEqual([["中のページ", "a.csn"]])
  })

  it("does not walk into directories that never hold pages", async () => {
    const found = await titles({ "a.csn": "投稿", "node_modules/pkg/b.csn": "入ってはいけない" })
    expect(found).toEqual(["投稿"])
  })

  it("reads .csnx as well as .csn", async () => {
    expect(await titles({ "a.csnx": "コンポーネントのページ\n<Modal />" })).toEqual([
      "コンポーネントのページ",
    ])
  })
})

describe("rootsOf", () => {
  const folders = [{ uri: "file:///w/site" }]

  it("reads the whole workspace folder when no sources are set", () => {
    expect(rootsOf(folders, [])).toEqual(["/w/site"])
  })

  it("reads each source under each workspace folder when they are set", () => {
    expect(rootsOf(folders, ["src/content", "src/pages"])).toEqual([
      "/w/site/src/content",
      "/w/site/src/pages",
    ])
  })

  it("skips a folder that is not a file:// URI", () => {
    expect(rootsOf([{ uri: "untitled:x" }], [])).toEqual([])
  })
})
