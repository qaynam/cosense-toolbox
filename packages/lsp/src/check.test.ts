import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { runCheck } from "./check"

const site = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "csn-check-"))
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => {
      await mkdir(dirname(join(root, name)), { recursive: true })
      await writeFile(join(root, name), text, "utf8")
    }),
  )
  return root
}

/** `csn-lsp check` with `args`, run from `cwd`. */
const check = (cwd: string, ...args: string[]) => Effect.runPromise(runCheck(args, cwd))

describe("csn-lsp check", () => {
  it("reports each link to a missing page with its file, line and column", async () => {
    const root = await site({
      "posts/a.csn": "投稿\n本文 [無いページ] と [設計メモ]",
      "posts/b.csn": "設計メモ\n中身",
    })
    const { output } = await check(root)
    expect(output).toBe("posts/a.csn:2:4 error リンク先のページが見つからない: [無いページ]\n")
  })

  it("fails when something is reported as an error", async () => {
    const root = await site({ "a.csn": "投稿\n[無いページ]" })
    expect((await check(root)).exitCode).toBe(1)
  })

  it("passes, saying nothing, when every link finds its page", async () => {
    const root = await site({ "a.csn": "投稿\n[設計メモ]", "b.csn": "設計メモ\n中身" })
    expect(await check(root)).toEqual({ output: "", exitCode: 0 })
  })

  it("reports but passes when told to report missing pages as warnings", async () => {
    const root = await site({ "a.csn": "投稿\n[無いページ]" })
    expect(await check(root, "--unresolved-links", "warning")).toEqual({
      output: "a.csn:2:1 warning リンク先のページが見つからない: [無いページ]\n",
      exitCode: 0,
    })
  })

  it("reads only the directories it is given, but finds pages in all of them", async () => {
    const root = await site({
      "src/content/a.csn": "投稿\n[概要]",
      "src/pages/about.csn": "概要\n中身",
      "other/b.csn": "対象外\n[無いページ]",
    })
    expect(await check(root, "src/content", "src/pages")).toEqual({ output: "", exitCode: 0 })
  })

  it("reads the site's own decoration markers as decorations, not links", async () => {
    const root = await site({ "a.csn": "投稿\n[! 注意]" })
    expect(await check(root, "--decorations", "|!~")).toEqual({ output: "", exitCode: 0 })
  })

  it("reads a first line of --- as the title with --no-frontmatter", async () => {
    const root = await site({ "a.csn": "---\n[無いページ]\n---\n本文" })
    expect((await check(root)).exitCode).toBe(0)
    expect((await check(root, "--no-frontmatter")).exitCode).toBe(1)
  })

  it("reads .csnx component lines as JSX, not as notation", async () => {
    const root = await site({ "a.csnx": 'T\n<Note href="[無いページ]" />' })
    expect(await check(root)).toEqual({ output: "", exitCode: 0 })
  })

  it("stops with the usage and exit code 2 on an option it does not know", async () => {
    const root = await site({ "a.csn": "投稿" })
    const { output, exitCode } = await check(root, "--fix")
    expect(exitCode).toBe(2)
    expect(output).toContain("Usage: csn-lsp check")
  })
})
