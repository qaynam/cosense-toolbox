import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { readIndex } from "./workspace"

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

  it("indexes a page that is only linked to, so it can still be completed", async () => {
    const found = await titles({ "a.csn": "投稿\n[まだ無いページ] と #タグ" })
    expect(found).toEqual(["まだ無いページ", "タグ", "投稿"].sort())
  })

  it("gives a file's page a uri and a linked-only page none", async () => {
    const root = await workspace({ "a.csn": "投稿\n[まだ無いページ]" })
    const { pages } = await Effect.runPromise(readIndex([root]))
    expect(pages.find((p) => p.title === "投稿")?.uri).toMatch(/^file:\/\/.*a\.csn$/)
    expect(pages.find((p) => p.title === "まだ無いページ")?.uri).toBeUndefined()
  })

  it("lets a real page win over a link of the same name", async () => {
    const root = await workspace({ "a.csn": "投稿\n[設計メモ]", "b.csn": "設計メモ\n中身" })
    const { pages } = await Effect.runPromise(readIndex([root]))
    expect(pages.filter((p) => p.title === "設計メモ")).toHaveLength(1)
    expect(pages.find((p) => p.title === "設計メモ")?.uri).toBeDefined()
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
