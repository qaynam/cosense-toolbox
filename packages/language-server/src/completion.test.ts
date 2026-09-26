import { Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  completionItems,
  definitionOf,
  detectCompletion,
  detectCompletionInDocument,
  isLinkBracket,
} from "./completion"
import type { Index } from "./workspace"

const at = (line: string, cursor: string) => detectCompletion(line, line.indexOf(cursor))

/** The detection, or undefined where there is none, so a test can read its fields. */
const found = <A>(detection: Option.Option<A>): A | undefined => Option.getOrUndefined(detection)

describe("isLinkBracket", () => {
  it("answers in a plain link, and in an empty one on its way to being typed", () => {
    expect(isLinkBracket("")).toBe(true)
    expect(isLinkBracket("ページ")).toBe(true)
    expect(isLinkBracket("Side Kanban")).toBe(true)
  })

  it("leaves every other notation alone", () => {
    // Accepting a candidate replaces the whole bracket, taking the notation with it.
    for (const inner of [
      "* 見出し",
      "$ x^2",
      "taro.icon",
      "ラベル https://example.invalid",
      "a.png",
      "/my-project/page",
    ]) {
      expect(isLinkBracket(inner), inner).toBe(false)
    }
  })
})

describe("detectCompletion", () => {
  it("answers inside a closed bracket, wherever the cursor sits in it", () => {
    const line = "本文 [ページ] の続き"
    const detected = found(detectCompletion(line, line.indexOf("ペ") + 1))
    expect(detected?.kind).toBe("link")
    // The whole bracket is the query, not just what is left of the cursor.
    expect(detected?.query).toBe("ページ")
  })

  it("does not answer before the bracket is closed", () => {
    expect(Option.isNone(detectCompletion("本文 [ページ", 8))).toBe(true)
  })

  it("does not answer inside `[[`, which opens emphasis rather than a link", () => {
    const line = "[[強調]]"
    expect(Option.isNone(detectCompletion(line, 3))).toBe(true)
  })

  it("answers after a hash at a tag boundary", () => {
    const detected = found(at("本文 #日記 の続き", "記"))
    expect(detected?.kind).toBe("hashtag")
    expect(detected?.query).toBe("日")
  })

  it("does not answer on a hash in the middle of a word", () => {
    expect(Option.isNone(at("a#b", "b"))).toBe(true)
  })

  it("replaces the notation whole, brackets included", () => {
    const line = "[ペ]"
    const detected = found(detectCompletion(line, 2))
    expect([detected?.replaceStart, detected?.replaceEnd]).toEqual([0, 3])
  })
})

describe("detectCompletionInDocument", () => {
  it("says nothing inside a code block, where a bracket is not notation", () => {
    const text = "タイトル\ncode:foo.js\n const a = [b]"
    expect(Option.isNone(detectCompletionInDocument(text, { line: 2, character: 12 }))).toBe(true)
  })

  it("says nothing inside an inline code span", () => {
    const text = "タイトル\n`[ページ]` と書いた"
    expect(Option.isNone(detectCompletionInDocument(text, { line: 1, character: 4 }))).toBe(true)
  })

  it("answers in ordinary text", () => {
    const text = "タイトル\n本文 [ページ] の続き"
    expect(found(detectCompletionInDocument(text, { line: 1, character: 5 }))?.kind).toBe("link")
  })
})

describe("completionItems", () => {
  const index: Index = {
    pages: [
      { title: "設計メモ", uri: "file:///w/notes/design.csn", location: "notes/design.csn" },
      { title: "Side Kanban", uri: "file:///w/kanban.csn", location: "kanban.csn" },
    ],
  }
  const labels = (text: string, character: number) =>
    completionItems(index, text, { line: 1, character }).map((item) => item.label)

  it("offers every page in an empty bracket, and none outside a link or a tag", () => {
    expect(labels("T\n[]", 1)).toEqual(["設計メモ", "Side Kanban"])
    expect(labels("T\n本文", 1)).toEqual([])
  })

  it("keeps the pages whose title holds the query, matched the way Cosense links", () => {
    expect(labels("T\n[side_k]", 2)).toEqual(["Side Kanban"])
  })

  it("leaves out after # a page whose title a tag cannot hold, but not one with a space", () => {
    // A space folds to `_` in a tag, so "Side Kanban" is `#Side_Kanban`; a bracket cannot.
    const withBracket: Index = {
      pages: [...index.pages, { title: "配列[0]", uri: "file:///w/a.csn", location: "a.csn" }],
    }
    const tags = completionItems(withBracket, "T\n#", { line: 1, character: 1 })
    expect(tags.map((item) => item.label)).toEqual(["設計メモ", "Side Kanban"])
  })

  it("replaces the whole notation, writing a tag's space as _", () => {
    const [link] = completionItems(index, "T\n[設計]", { line: 1, character: 2 })
    expect(link?.textEdit).toEqual({
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
      newText: "[設計メモ]",
    })
    const [tag] = completionItems(
      { pages: [{ title: "a b", uri: "file:///w/ab.csn", location: "ab.csn" }] },
      "T\n#a",
      {
        line: 1,
        character: 2,
      },
    )
    expect(tag?.textEdit).toMatchObject({ newText: "#a_b" })
  })

  it("shows the page's file name next to its title, short enough not to be cut off", () => {
    const items = completionItems(index, "T\n[]", { line: 1, character: 1 })
    expect(items.map((item) => [item.label, item.detail])).toEqual([
      ["設計メモ", "design.csn"],
      ["Side Kanban", "kanban.csn"],
    ])
  })

  it("shows the whole path in the documentation, for when the name is not enough", () => {
    const items = completionItems(index, "T\n[]", { line: 1, character: 1 })
    expect(items.map((item) => item.documentation)).toEqual(["notes/design.csn", "kanban.csn"])
  })
})

describe("definitionOf", () => {
  const index: Index = {
    pages: [{ title: "設計メモ", uri: "file:///w/design.csn", location: "design.csn" }],
  }

  it("opens the file of the page a link names, at its top", () => {
    expect(found(definitionOf(index, "T\n[設計メモ]", { line: 1, character: 2 }))).toEqual({
      uri: "file:///w/design.csn",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    })
  })

  it("has nowhere to go for a page that is only linked to", () => {
    expect(
      Option.isNone(definitionOf(index, "T\n[まだ無いページ]", { line: 1, character: 2 })),
    ).toBe(true)
  })
})
