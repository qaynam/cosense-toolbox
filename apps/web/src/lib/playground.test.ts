import { Option } from "effect"
import type { ElementContent, Properties, Root } from "hast"
import { describe, expect, it } from "vitest"

import { breakLine, formatHtml, indentLines, sourceFromHash, sourceToHash } from "./playground"

const element = (
  tagName: string,
  properties: Properties,
  children: ElementContent[],
): ElementContent => ({ type: "element", tagName, properties, children })

const text = (value: string): ElementContent => ({ type: "text", value })

describe("sourceToHash / sourceFromHash", () => {
  it("記法を縮めて #code= の後に書き、読み戻すと元の記法になる", async () => {
    const source = "タイトル\n [* 太字] と #タグ\n code:a.js\n \tconst a = 1 // 🦫"

    const hash = await sourceToHash(source)

    expect(hash.startsWith("#code=")).toBe(true)
    expect(await sourceFromHash(hash)).toEqual(Option.some(source))
  })

  it("#code= の後は、URL にそのまま入る文字だけでできている", async () => {
    const hash = await sourceToHash("ä/?#&=+ ".repeat(50))

    expect(hash.slice("#code=".length)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("#code= が無ければ、記法も無い", async () => {
    expect(await sourceFromHash("")).toEqual(Option.none())
    expect(await sourceFromHash("#heading")).toEqual(Option.none())
  })

  it("壊れた符号は、記法が無いものとして扱う", async () => {
    expect(await sourceFromHash("#code=!!!")).toEqual(Option.none())
    expect(await sourceFromHash("#code=AAAA")).toEqual(Option.none())
  })
})

describe("formatHtml", () => {
  it("子がすべて文の中の要素なら、1 行に収める", () => {
    const line = element("div", { className: ["line"] }, [
      text("a & "),
      element("strong", {}, [text("b")]),
    ])

    expect(formatHtml(line)).toBe('<div class="line">a &amp; <strong>b</strong></div>')
  })

  it("ブロックの子を持つ要素は、子を 1 つずつ字下げした行に分ける", () => {
    const page = element("div", { className: ["page"] }, [
      element("div", { className: ["line"] }, [text("a")]),
      element("div", { className: ["line"] }, [text("b")]),
    ])

    expect(formatHtml(page)).toBe(
      [
        '<div class="page">',
        '  <div class="line">a</div>',
        '  <div class="line">b</div>',
        "</div>",
      ].join("\n"),
    )
  })

  it("入れ子が深くなるほど、深く字下げする", () => {
    const table = element("table", {}, [
      element("tbody", {}, [element("tr", {}, [element("td", {}, [text("a")])])]),
    ])

    expect(formatHtml(table)).toBe(
      [
        "<table>",
        "  <tbody>",
        "    <tr>",
        "      <td>a</td>",
        "    </tr>",
        "  </tbody>",
        "</table>",
      ].join("\n"),
    )
  })

  it("pre の中身は、改行も字下げもそのまま残す", () => {
    const block = element("div", {}, [element("pre", {}, [element("code", {}, [text("a\n  b")])])])

    expect(formatHtml(block)).toBe(
      ["<div>", "  <pre><code>a\n  b</code></pre>", "</div>"].join("\n"),
    )
  })

  it("ブロックの間にある空白だけの文字は落とす", () => {
    const page = element("div", {}, [text("\n"), element("p", {}, [text("a")]), text("\n  ")])

    expect(formatHtml(page)).toBe(["<div>", "  <p>a</p>", "</div>"].join("\n"))
  })

  it("ブロックと並ぶ文字は、前後の空白を落として 1 行にする", () => {
    const block = element("div", {}, [element("p", {}, [text("a")]), text("\n  b\n")])

    expect(formatHtml(block)).toBe(["<div>", "  <p>a</p>", "  b", "</div>"].join("\n"))
  })

  it("根の子は、字下げせずに 1 行ずつ並べる", () => {
    const root: Root = {
      type: "root",
      children: [element("p", {}, [text("a")]), element("p", {}, [text("b")])],
    }

    expect(formatHtml(root)).toBe(["<p>a</p>", "<p>b</p>"].join("\n"))
  })
})

describe("indentLines", () => {
  describe("字下げ", () => {
    it("カーソルのある行の頭に空白を 1 つ足し、カーソルもその分だけ進める", () => {
      expect(indentLines("ab\ncd", { start: 4, end: 4 }, "indent")).toEqual(
        Option.some({ from: 3, to: 5, insert: " cd", selection: { start: 5, end: 5 } }),
      )
    })

    it("選択が触れているすべての行を字下げする", () => {
      expect(indentLines("ab\ncd\nef", { start: 1, end: 4 }, "indent")).toEqual(
        Option.some({ from: 0, to: 5, insert: " ab\n cd", selection: { start: 2, end: 6 } }),
      )
    })

    it("選択が次の行の頭で終わるなら、その行は字下げしない", () => {
      expect(indentLines("ab\ncd", { start: 0, end: 3 }, "indent")).toEqual(
        Option.some({ from: 0, to: 2, insert: " ab", selection: { start: 1, end: 4 } }),
      )
    })
  })

  describe("字上げ", () => {
    it("選択が触れている行から、頭の空白かタブを 1 つずつ取る", () => {
      expect(indentLines(" ab\n\tcd\nef", { start: 1, end: 10 }, "outdent")).toEqual(
        Option.some({ from: 0, to: 10, insert: "ab\ncd\nef", selection: { start: 0, end: 8 } }),
      )
    })

    it("取るのは 1 段だけ", () => {
      expect(indentLines("  ab", { start: 4, end: 4 }, "outdent")).toEqual(
        Option.some({ from: 0, to: 4, insert: " ab", selection: { start: 3, end: 3 } }),
      )
    })

    it("行の頭にあるカーソルは、行の外へ出さない", () => {
      expect(indentLines(" ab", { start: 0, end: 0 }, "outdent")).toEqual(
        Option.some({ from: 0, to: 3, insert: "ab", selection: { start: 0, end: 0 } }),
      )
    })

    it("取れる空白が無ければ、何も変えない", () => {
      expect(indentLines("ab", { start: 1, end: 1 }, "outdent")).toEqual(Option.none())
    })
  })
})

describe("breakLine", () => {
  it("字下げした行で改行すると、次の行も同じ深さで始まる", () => {
    expect(breakLine("  ab", { start: 4, end: 4 })).toEqual({
      from: 4,
      to: 4,
      insert: "\n  ",
      selection: { start: 7, end: 7 },
    })
  })

  it("字下げにタブを使っていれば、タブのまま引き継ぐ", () => {
    expect(breakLine("\tab", { start: 3, end: 3 })).toEqual({
      from: 3,
      to: 3,
      insert: "\n\t",
      selection: { start: 5, end: 5 },
    })
  })

  it("選択しているときは、選択を改行に置き換える", () => {
    expect(breakLine(" abcd", { start: 2, end: 4 })).toEqual({
      from: 2,
      to: 4,
      insert: "\n ",
      selection: { start: 4, end: 4 },
    })
  })

  it("カーソルが字下げの途中にあれば、カーソルより前の字下げだけを引き継ぐ", () => {
    expect(breakLine("   ab", { start: 1, end: 1 })).toEqual({
      from: 1,
      to: 1,
      insert: "\n ",
      selection: { start: 3, end: 3 },
    })
  })

  it("字下げの無い行では、前の行が字下げしてあっても、ただ改行する", () => {
    expect(breakLine(" ab\ncd", { start: 6, end: 6 })).toEqual({
      from: 6,
      to: 6,
      insert: "\n",
      selection: { start: 7, end: 7 },
    })
  })
})
