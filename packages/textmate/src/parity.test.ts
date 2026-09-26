/**
 * The grammar against the language server, character by character.
 *
 * Zed colours `.csn` from the language server, which reads with the parser itself; Shiki
 * and VS Code colour it from this grammar. Both are held to the same answer here, over the
 * parser's conformance fixtures and the example posts.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { computeTokens, TOKEN_TYPES } from "@cosense-toolbox/language-server/tokens"
import { Array as Arr, Order, pipe, Record as Rec } from "effect"
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"
import minLight from "shiki/themes/min-light.mjs"
import { beforeAll, describe, expect, it } from "vitest"

import { cosense, cosenseX, type Notation, SCOPES } from "./index"

const repoRoot = join(import.meta.dirname, "../../..")

const NOTATION_OF: ReadonlyMap<string, Notation> = new Map(
  Arr.map(Rec.toEntries(SCOPES), ([notation, scope]) => [scope, notation] as const),
)

/** Notations per character, one entry per line. `\n` is not a character here. */
type Marks = string[][]

const marksFromServer = (text: string, components: boolean): Marks => {
  const tokens = computeTokens(text, { components })
  return text.split("\n").map((line, n) =>
    Array.from(line, (_, c) =>
      pipe(
        tokens,
        Arr.filter((t) => t.line === n && c >= t.char && c < t.char + t.length),
        Arr.map((t) => t.type),
        Arr.dedupe,
        Arr.sort(Order.string),
        Arr.join(" "),
      ),
    ),
  )
}

/**
 * Shiki skips an empty line without handing it to the grammar, so the state before it
 * carries over: a blank line would not end a code block, and a blank first line would
 * make the second the title. That is Shiki's, not the grammar's (VS Code tokenizes every
 * line), so each empty line is given a zero-width space, which no rule reads as anything
 * but "a line indented by nothing". Its one character is never compared: the line it
 * stands for has none.
 */
const VISIBLE_EMPTY_LINE = "\u200b"

const marksFromGrammar = (shiki: HighlighterCore, text: string, lang: string): Marks =>
  shiki
    .codeToTokensBase(
      text
        .split("\n")
        .map((line) => (line === "" ? VISIBLE_EMPTY_LINE : line))
        .join("\n"),
      { lang, theme: "min-light", includeExplanation: "scopeName" },
    )
    .map((line) =>
      line.flatMap((token) =>
        (token.explanation ?? []).flatMap((part) => {
          const notations = part.scopes
            .map((scope) => NOTATION_OF.get(scope.scopeName))
            .filter((notation) => notation !== undefined)
          return Array.from(part.content, () => [...new Set(notations)].sort().join(" "))
        }),
      ),
    )

interface Sample {
  readonly name: string
  readonly text: string
  readonly components: boolean
}

const conformance = JSON.parse(
  readFileSync(join(repoRoot, "packages/parser/src/fixtures/conformance.json"), "utf8"),
) as Record<"inline" | "page", { description: string; input: string }[]>

const postsDir = join(repoRoot, "examples/astro-blog/src")

const samples: Sample[] = [
  // Inline cases are one line; a title goes above so they are read as body.
  ...conformance.inline.map((c) => ({
    name: `inline: ${c.description}`,
    text: `T\n${c.input}`,
    components: false,
  })),
  ...conformance.page.map((c) => ({
    name: `page: ${c.description}`,
    text: c.input,
    components: false,
  })),
  ...readdirSync(postsDir, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.csnx?$/.test(path))
    .map((path) => ({
      name: `example: ${path}`,
      text: readFileSync(join(postsDir, path), "utf8").replace(/\r\n?/g, "\n"),
      components: path.endsWith(".csnx"),
    })),
  {
    name: "full-width spaces indent and bound tags",
    text: "T\ncode:a.js\n\u3000x\n本文\u3000#tag\n\u3000[page]",
    components: false,
  },
  {
    name: "every emphasis marker at once",
    text: "T\n[-* 打ち消し太字] [_/ 下線斜体] [** 大] [**** 特大] [[強調 [page]]]",
    components: false,
  },
  {
    name: "component tags read as JSX",
    text: '<Callout type="warn" title=\'注意\'>\n <Counter start={10} style={{ a: 1 }} />\n <Note href="[page]"> から [page] #tag\n</Callout>',
    components: true,
  },
  {
    name: "frontmatter, then a component",
    text: '---\ntitle: 投稿\n---\nはじめての投稿\n<Callout type="warn">\n [page] #tag\n</Callout>',
    components: true,
  },
]

/** Lines where the two disagree, as `line N: grammar ≠ server`, for a readable failure. */
const disagreements = (grammar: Marks, server: Marks, text: string): string[] =>
  text.split("\n").flatMap((line, n) => {
    const g = grammar[n] ?? []
    const s = server[n] ?? []
    const differs = Array.from(line).some((_, c) => (g[c] ?? "") !== (s[c] ?? ""))
    if (!differs) return []
    const show = (marks: string[]) =>
      Array.from(line, (ch, c) => (marks[c] ? `${ch}{${marks[c]}}` : ch)).join("")
    return [`line ${n}: ${JSON.stringify(line)}\n  grammar: ${show(g)}\n  server:  ${show(s)}`]
  })

describe.each([
  ["oniguruma", () => createOnigurumaEngine(import("shiki/wasm"))],
  ["JavaScript", () => createJavaScriptRegexEngine()],
])("with the %s regex engine", (_, engine) => {
  let shiki: HighlighterCore

  beforeAll(async () => {
    shiki = await createHighlighterCore({
      themes: [minLight],
      langs: [cosense, cosenseX],
      engine: engine(),
    })
  })

  it.each(samples.map((s) => [s.name, s] as const))("matches the server: %s", (_, sample) => {
    const grammar = marksFromGrammar(
      shiki,
      sample.text,
      sample.components ? "cosense-x" : "cosense",
    )
    const server = marksFromServer(sample.text, sample.components)
    expect(disagreements(grammar, server, sample.text)).toEqual([])
  })
})

describe("SCOPES", () => {
  it("names every notation the server knows by itself, and no other", () => {
    expect(Object.keys(SCOPES).sort()).toEqual(
      TOKEN_TYPES.filter((type) => type !== "notation").sort(),
    )
  })

  it("has no scope for a notation the server's caller defines, which a grammar cannot know", () => {
    expect(Object.keys(SCOPES)).not.toContain("notation")
  })

  it("gives each notation its own scope, so none is read as another", () => {
    expect(new Set(Object.values(SCOPES)).size).toBe(Object.keys(SCOPES).length)
  })
})
