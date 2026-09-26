import { describe, expect, it } from "vitest"

import { defaultSettings, parseOptionsOf } from "./settings"
import { computeTokens, encodeTokens, LEGEND, legendOf, type RawToken, TOKEN_TYPES } from "./tokens"

const typesOn = (text: string, line: number, options = {}) =>
  computeTokens(text, options)
    .filter((t) => t.line === line)
    .map((t) => t.type)

/** The token type of each encoded token: the fourth of every five numbers. */
const typesIn = (data: ReadonlyArray<number>) => data.filter((_, index) => index % 5 === 3)

describe("computeTokens", () => {
  it("reads the first line as the title", () => {
    expect(typesOn("はじめての投稿\n本文", 0)).toEqual(["title"])
  })

  it("reads the notations Cosense has", () => {
    const text = "T\n[page] [https://example.invalid] #tag `code` [* 太字] [/ 斜体]"
    expect(typesOn(text, 1)).toEqual(
      expect.arrayContaining(["link", "externalLink", "hashtag", "code", "bold", "italic"]),
    )
  })

  it("applies every marker in one run, as Cosense does", () => {
    expect(typesOn("T\n[-* 太字で打ち消し]", 1)).toEqual(expect.arrayContaining(["strike", "bold"]))
  })

  it("grades emphasis by asterisk count", () => {
    expect(typesOn("T\n[* 一]", 1)).toContain("bold")
    expect(typesOn("T\n[** 二]", 1)).toContain("bold2")
    expect(typesOn("T\n[**** 四]", 1)).toContain("bold3")
  })

  it("marks a code block whole, line by line", () => {
    const text = "T\ncode:foo.js\n const a = 1\n const b = 2"
    expect(typesOn(text, 2)).toEqual(["codeBlock"])
    expect(typesOn(text, 3)).toEqual(["codeBlock"])
  })
})

describe("frontmatter", () => {
  const text = "---\ntitle: 投稿\n---\nはじめての投稿\n[page]"

  it("marks the YAML fence instead of parsing it as notation", () => {
    expect(typesOn(text, 0)).toEqual(["frontmatter"])
    expect(typesOn(text, 1)).toEqual(["frontmatter"])
    expect(typesOn(text, 2)).toEqual(["frontmatter"])
  })

  it("finds the title on the first line after it, not on the fence", () => {
    expect(typesOn(text, 3)).toEqual(["title"])
    expect(typesOn(text, 4)).toEqual(["link"])
  })
})

describe("component lines", () => {
  const text = 'T\n<Callout type="warn">\n 中身\n[page]'

  /** The text each token on `line` covers, with its type. */
  const spansOn = (source: string, line: number) =>
    computeTokens(source, { components: true })
      .filter((t) => t.line === line)
      .map((t) => [t.type, source.split("\n")[line]?.slice(t.char, t.char + t.length)])

  it("are read only for .csnx", () => {
    expect(typesOn(text, 1, { components: true })).toContain("component")
    expect(typesOn(text, 1)).not.toContain("component")
  })

  it("read the tag as JSX: its name, attribute names and values", () => {
    expect(spansOn("T\n<Callout type=\"warn\" title='注意'>", 1)).toEqual([
      ["component", "Callout"],
      ["attribute", "type"],
      ["attributeValue", '"warn"'],
      ["attribute", "title"],
      ["attributeValue", "'注意'"],
    ])
  })

  it("read a braced value whole, nested braces and all", () => {
    expect(spansOn("T\n<Counter start={10} style={{ a: 1 }} />", 1)).toEqual([
      ["component", "Counter"],
      ["attribute", "start"],
      ["expression", "{10}"],
      ["attribute", "style"],
      ["expression", "{{ a: 1 }}"],
    ])
  })

  it("mark a closing tag by its name", () => {
    expect(spansOn("T\n</Callout>", 1)).toEqual([["component", "Callout"]])
  })

  it("own their line, so neither text after the tag nor a value is notation", () => {
    expect(spansOn('T\n<Note href="[page]"> [page] #tag', 1)).toEqual([
      ["component", "Note"],
      ["attribute", "href"],
      ["attributeValue", '"[page]"'],
    ])
  })

  it("are a component, not the title, on the first line", () => {
    expect(spansOn('<Callout type="warn">\n 中身', 0)).toEqual([
      ["component", "Callout"],
      ["attribute", "type"],
      ["attributeValue", '"warn"'],
    ])
    expect(typesOn('<Callout type="warn">\n 中身', 0)).toEqual(["title"])
  })
})

describe("encodeTokens", () => {
  it("emits five numbers per token, relative to the one before", () => {
    const data = encodeTokens([
      { line: 0, char: 0, length: 3, type: "title" },
      { line: 2, char: 4, length: 6, type: "link" },
      { line: 2, char: 12, length: 2, type: "hashtag" },
    ])
    expect(data.length).toBe(15)
    expect(data.slice(0, 3)).toEqual([0, 0, 3])
    expect(data.slice(5, 8)).toEqual([2, 4, 6])
    // Same line as the one before, so the column is relative too.
    expect(data.slice(10, 13)).toEqual([0, 8, 2])
  })

  it("sends only types the client is expected to know, a notation of no known name included", () => {
    const everyKind: RawToken[] = [
      ...TOKEN_TYPES.filter((type) => type !== "notation").map((type, line) => ({
        line,
        char: 0,
        length: 1,
        type,
      })),
      { line: 99, char: 0, length: 1, type: "notation", name: "not-in-the-legend" },
    ]
    expect(Math.max(...typesIn(encodeTokens(everyKind)))).toBeLessThan(LEGEND.length)
  })

  it("keeps a link and a tag apart, since a reader tells them apart", () => {
    const [link] = encodeTokens([{ line: 0, char: 0, length: 1, type: "link" }]).slice(3, 4)
    const [tag] = encodeTokens([{ line: 0, char: 0, length: 1, type: "hashtag" }]).slice(3, 4)
    expect(link).not.toBe(tag)
  })
})

describe("parse options", () => {
  it("do not colour a bracket as a link when its marker is a listed decoration", () => {
    const parseOptions = parseOptionsOf({ ...defaultSettings, decorations: ["!"] })
    expect(typesOn("T\n[! 注意]", 1, { parseOptions })).not.toContain("link")
    expect(typesOn("T\n[! 注意]", 1)).toContain("link")
  })
})

describe("notations the caller defines", () => {
  const notations = [
    { marker: "!", name: "warning" },
    { marker: "~", name: "note" },
  ]
  const tokensOn = (text: string, line: number) =>
    computeTokens(text, { notations }).filter((t) => t.line === line)

  it("read a bracket opened by their marker as that notation, not a link", () => {
    expect(tokensOn("T\n[! 注意]", 1)).toEqual([
      { line: 1, char: 0, length: 6, type: "notation", name: "warning" },
    ])
  })

  it("keep Cosense's own markers alongside: `[!* x]` is the notation and bold", () => {
    expect(tokensOn("T\n[!* 強い注意]", 1).map((t) => t.type)).toEqual(
      expect.arrayContaining(["notation", "bold"]),
    )
  })

  it("are not read at all when not given, as the parser reads them", () => {
    expect(typesOn("T\n[! 注意]", 1)).toEqual(["link"])
  })

  it("are added to the legend after the LSP's own types, once each", () => {
    expect(legendOf([...notations, { marker: "?", name: "warning" }])).toEqual([
      ...LEGEND,
      "warning",
      "note",
    ])
  })

  it("encode as their own type in a legend that has it", () => {
    const legend = legendOf(notations)
    const [, , , type] = encodeTokens(computeTokens("T\n[~ 補足]", { notations }).slice(1), legend)
    expect(legend[type as number]).toBe("note")
  })

  it("encode as a decorator in the LSP's own legend, which every client knows", () => {
    const [, , , type] = encodeTokens(computeTokens("T\n[~ 補足]", { notations }).slice(1))
    expect(LEGEND[type as number]).toBe("decorator")
  })
})

describe("frontmatter: false", () => {
  it("reads a first line of --- as the title, since a Cosense page has no frontmatter", () => {
    const text = "---\na: 1\n---\n本文"
    expect(typesOn(text, 0, { frontmatter: false })).toEqual(["title"])
    expect(typesOn(text, 1, { frontmatter: false })).toEqual([])
    expect(typesOn(text, 0)).toEqual(["frontmatter"])
  })
})
