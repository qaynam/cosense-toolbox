import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"

import { findMediaRoots, readIndex, rootsOf, siteOf } from "./workspace"

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

describe("findMediaRoots", () => {
  it("finds each site's media root, wherever in the workspace the site is", async () => {
    const root = await workspace({
      "apps/web/public/a.png": "",
      "examples/blog/public/b.png": "",
      "notes/a.csn": "T",
    })
    const found = await Effect.runPromise(findMediaRoots([root], "public"))
    expect([...found].sort()).toEqual([
      join(root, "apps/web/public"),
      join(root, "examples/blog/public"),
    ])
  })

  it("does not look inside directories that never hold a site", async () => {
    const root = await workspace({ "node_modules/pkg/public/a.png": "" })
    expect(await Effect.runPromise(findMediaRoots([root], "public"))).toEqual([])
  })
})

describe("siteOf", () => {
  it("is the media root of the nearest site above the file", () => {
    const roots = ["/w/public", "/w/apps/web/public"]
    expect(Option.getOrNull(siteOf("/w/apps/web/src/pages/a.csn", roots))).toBe(
      "/w/apps/web/public",
    )
    expect(Option.getOrNull(siteOf("/w/notes/a.csn", roots))).toBe("/w/public")
  })

  it("is none for a file in no site", () => {
    expect(Option.isNone(siteOf("/w/notes/a.csn", ["/w/apps/web/public"]))).toBe(true)
  })
})

describe("readIndex in a workspace with a site", () => {
  it("reads [:/…] as a file only in a page of the site", async () => {
    const root = await workspace({
      "apps/web/public/a.png": "",
      "apps/web/src/a.csn": "A\n[:/a.png]",
      "notes/b.csn": "B\n[:/a.png]",
    })
    const options = { mediaRoots: [join(root, "apps/web/public")] }
    const pages = (await Effect.runPromise(readIndex([root], options))).pages
    expect(pages.map((page) => [page.title, page.links])).toEqual([
      ["A", []],
      ["B", [":/a.png"]],
    ])
  })
})
