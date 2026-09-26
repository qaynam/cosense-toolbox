import type { Element, ElementContent } from "hast"
import { describe, expect, it } from "vitest"

import { parse } from "../parse"
import { codeLineNumbers } from "./code-line-numbers"
import { toHtml } from "./to-html"

const italic = (value: string): Element => ({
  type: "element",
  tagName: "i",
  properties: {},
  children: [{ type: "text", value }],
})

/** テキスト 1 つを子に持つ要素。 */
const tag = (tagName: string, children: ElementContent[]): Element => ({
  type: "element",
  tagName,
  properties: {},
  children,
})

describe("codeLineNumbers", () => {
  const SOURCE = "タイトル\ncode:a.js\n one\n two"
  const attributes = (html: string, name: string): string[] =>
    [...html.matchAll(new RegExp(`<div class="line code-block"[^>]*${name}="(\\d+)"`, "g"))].map(
      (match) => match[1] ?? "",
    )

  it("コードブロックの本体行に、1 から数えた data-line を付ける。ヘッダ行には付けない", () => {
    const html = toHtml(parse(SOURCE), { extensions: [codeLineNumbers()] })
    expect(attributes(html, "data-line")).toEqual(["1", "2"])
    expect(html).toContain('<div class="line code-block"><code class="code-start">')
  })

  it("番号の桁数 (ブロックの最後の番号の桁数) を data-line-digits で全行に付ける。CSS が番号の欄の幅に使う", () => {
    const body = Array.from({ length: 10 }, (_, index) => ` line${index}`).join("\n")
    const html = toHtml(parse(`タイトル\ncode:a.js\n${body}\ncode:b.js\n x`), {
      extensions: [codeLineNumbers()],
    })
    expect(attributes(html, "data-line-digits")).toEqual([...Array(10).fill("2"), "1"])
  })

  it("色付けして 1 行ずつに入れ直したブロックにも付く", () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [codeLineNumbers()],
      highlight: (code) =>
        code.split("\n").map((value) => ({
          type: "element" as const,
          tagName: "span",
          properties: { className: ["line"] },
          children: [{ type: "text" as const, value }],
        })),
    })
    expect(attributes(html, "data-line")).toEqual(["1", "2"])
  })

  it("ひと塊にまとめたブロックには付けない (行と番号が対応しないため)", () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [codeLineNumbers()],
      highlight: (code) => [italic(code)],
    })
    expect(attributes(html, "data-line")).toEqual([])
  })

  it("handlers で codeBlock を置き換えても、行の要素が並んでいれば番号が付く", () => {
    const html = toHtml(parse(SOURCE), {
      handlers: {
        codeBlock: (node) => [
          tag("div", [{ type: "text", value: node.filename }]),
          ...node.lines.map((line) => tag("div", [{ type: "text", value: line.value }])),
        ],
      },
      extensions: [codeLineNumbers()],
    })
    expect(html).toContain('<div data-line="1" data-line-digits="1">one</div>')
  })

  it("handlers の出力が行の数と合わなければ、番号を付けずにそのまま出す", () => {
    const html = toHtml(parse(SOURCE), {
      handlers: { codeBlock: () => tag("pre", []) },
      extensions: [codeLineNumbers()],
    })
    expect(html).toContain("<pre></pre>")
    expect(html).not.toContain("data-line")
  })
})
