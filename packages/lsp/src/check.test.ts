import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { type Extension, publicMedia } from "@cosense-toolbox/parser/extensions"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { checkSite, runCheck, USAGE } from "./check"

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

  it("reads every Cosense decoration marker as a decoration, not a link", async () => {
    const root = await site({ "a.csn": "投稿\n[! 注意] [| 引用] [~ 補足]" })
    expect(await check(root)).toEqual({ output: "", exitCode: 0 })
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

  it("reads [:/…] in a page of a site as a file of the site, not as a link", async () => {
    const root = await site({ "public/images/a.png": "", "src/a.csn": "A\n[:/images/a.png]" })
    expect(await check(root, "src")).toEqual({ output: "", exitCode: 0 })
  })

  it("reports each [:/…] whose file the page's site does not have", async () => {
    const root = await site({ "public/images/a.png": "", "src/a.csn": "A\n[:/images/b.png]" })
    expect(await check(root, "src")).toEqual({
      output: "src/a.csn:2:1 error ファイルが見つからない: /images/b.png\n",
      exitCode: 1,
    })
  })

  it("reports a missing file as loudly as it is told to report a missing page", async () => {
    const root = await site({ "public/images/a.png": "", "src/a.csn": "A\n[:/images/b.png]" })
    expect(await check(root, "src", "--unresolved-links", "warning")).toEqual({
      output: "src/a.csn:2:1 warning ファイルが見つからない: /images/b.png\n",
      exitCode: 0,
    })
  })

  it("reports what it finds in a page in the order it is written", async () => {
    const root = await site({
      "public/images/a.png": "",
      "src/a.csn": "A\n[:/images/b.png]\n[無いページ]",
    })
    expect((await check(root, "src")).output).toBe(
      "src/a.csn:2:1 error ファイルが見つからない: /images/b.png\n" +
        "src/a.csn:3:1 error リンク先のページが見つからない: [無いページ]\n",
    )
  })

  it("reads [:/…] as a link to a page outside a site, as Cosense Web does", async () => {
    const root = await site({ "src/a.csn": "A\n[:/images/a.png]" })
    expect((await check(root, "src")).output).toBe(
      "src/a.csn:2:1 error リンク先のページが見つからない: [:/images/a.png]\n",
    )
  })

  it("stops with the usage and exit code 2 on an option it does not know", async () => {
    const root = await site({ "a.csn": "投稿" })
    const { output, exitCode } = await check(root, "--fix")
    expect(exitCode).toBe(2)
    expect(output).toContain("Usage: csn-lsp check")
  })

  it("stops with exit code 2, naming the levels there are, on a level it does not know", async () => {
    const root = await site({ "a.csn": "投稿\n[無いページ]" })
    const { output, exitCode } = await check(root, "--unresolved-links", "eror")
    expect(exitCode).toBe(2)
    expect(output).toContain(
      'csn-lsp check: --unresolved-links takes one of off, hint, information, warning, error, not "eror"',
    )
  })

  it("prints the usage and passes with --help", async () => {
    const root = await site({ "a.csn": "投稿\n[無いページ]" })
    expect(await check(root, "--help")).toEqual({ output: USAGE, exitCode: 0 })
  })
})

describe("checkSite", () => {
  it("gives each report its file, its line and column counted from 1, and its level", async () => {
    const root = await site({ "posts/a.csn": "投稿\n本文 [無いページ]" })
    const reports = await Effect.runPromise(
      checkSite({ roots: [root], unresolvedLinks: "warning" }),
    )
    expect(reports).toEqual([
      {
        path: join(root, "posts/a.csn"),
        line: 2,
        column: 4,
        level: "warning",
        message: "リンク先のページが見つからない: [無いページ]",
      },
    ])
  })

  it("parses with the parse options it is given, as a site's build does", async () => {
    // A site's own notation: `[@x]` is a formula, so there is no page to look for.
    const atFormula: Extension = {
      bracketRules: [(inner) => (inner.startsWith("@") ? { type: "formula", value: inner } : null)],
    }
    const root = await site({ "a.csn": "投稿\n[@x]" })
    const reports = await Effect.runPromise(
      checkSite({
        roots: [root],
        unresolvedLinks: "error",
        parseOptions: { extensions: [atFormula] },
      }),
    )
    expect(reports).toEqual([])
  })

  it("reads [:/…] as a file when the parse options say so, without looking for the file", async () => {
    const root = await site({ "a.csn": "投稿\n[:/images/a.png]" })
    const reports = await Effect.runPromise(
      checkSite({
        roots: [root],
        unresolvedLinks: "error",
        parseOptions: { extensions: [publicMedia()] },
      }),
    )
    expect(reports).toEqual([])
  })
})
