import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { publicMedia } from "@cosense-toolbox/parser/extensions"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { hasMediaRoot, readIndex, rootsOf } from "./workspace"

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

  it("takes a first line of --- as the title when frontmatter is off", async () => {
    const root = await workspace({ "a.csn": "---\ntitle: x\n---\n本文" })
    const titlesWith = async (frontmatter: boolean) =>
      (await Effect.runPromise(readIndex([root], { frontmatter }))).pages.map((p) => p.title)
    expect(await titlesWith(false)).toEqual(["---"])
    expect(await titlesWith(true)).toEqual(["本文"])
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

  it("records the pages each page links to, by a link or a tag, and none in code", async () => {
    const root = await workspace({
      "a.csn": "T [題の括弧]\n[設計メモ] #日記 `[コード]`\n[設計メモ]",
    })
    const [page] = (await Effect.runPromise(readIndex([root]))).pages
    expect(page?.links).toEqual(["設計メモ", "日記"])
  })

  it("records when the file was last changed", async () => {
    const root = await workspace({ "a.csn": "T\n本文" })
    const changed = new Date("2026-09-30T12:00:00Z")
    await utimes(join(root, "a.csn"), changed, changed)
    const [page] = (await Effect.runPromise(readIndex([root]))).pages
    expect(page?.updated).toBe(changed.getTime())
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

describe("hasMediaRoot", () => {
  it("is true when a workspace folder holds the directory media is served from", async () => {
    const root = await workspace({ "public/images/a.png": "" })
    expect(hasMediaRoot([{ uri: pathToFileURL(root).href }], "public")).toBe(true)
  })

  it("is false when no folder holds it, as in a folder of plain Cosense pages", async () => {
    const root = await workspace({ "a.csn": "T" })
    expect(hasMediaRoot([{ uri: pathToFileURL(root).href }], "public")).toBe(false)
  })
})

describe("readIndex with the site's notation", () => {
  it("does not count a file under the media root as a link", async () => {
    const root = await workspace({ "a.csn": "T\n[:/images/a.png] [ページ]" })
    const options = { parseOptions: { extensions: [publicMedia()] } }
    const [page] = (await Effect.runPromise(readIndex([root], options))).pages
    expect(page?.links).toEqual(["ページ"])
  })
})
