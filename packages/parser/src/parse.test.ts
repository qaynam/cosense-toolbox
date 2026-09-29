/**
 * ページ全体・行レベルの仕様。ブロック構造 (タイトル / code: / table:) はここで検証する。
 */
import { describe, expect, it } from "vitest"

import { tableCellNotation } from "./extensions"
import type { Extension } from "./inline/types"
import { parse, parseLine } from "./parse"
import { at, stripPositions } from "./test-helpers"
import type { CodeBlock, InlineNode, LineBlock, TableBlock, TopLevelBlock } from "./types"

/** 1 行分の先頭のインラインノード。装飾のように行頭から始まる記法を書きやすくする。 */
const firstInline = (line: string, ...extensions: readonly Extension[]): InlineNode => {
  const node = parseLine(line, { extensions }).children[0]
  if (node === undefined) throw new Error(`インラインノードが無い: ${line}`)
  return node
}

/** タイトル行を省いて本文だけ書けるようにする (テストの意図をタイトルで濁らせない)。 */
const body = (...lines: string[]): readonly TopLevelBlock[] =>
  parse(["title", ...lines].join("\n")).children.slice(1)

const blockAt = <T extends TopLevelBlock["type"]>(
  blocks: readonly TopLevelBlock[],
  index: number,
  type: T,
): Extract<TopLevelBlock, { type: T }> => {
  const block = blocks[index]
  if (block?.type !== type) throw new Error(`expected ${type} at ${index}, got ${block?.type}`)
  return block as Extract<TopLevelBlock, { type: T }>
}

describe("ページ", () => {
  it("1 行目はタイトルになる", () => {
    const page = parse("ページタイトル\n本文")
    expect(page.type).toBe("page")
    expect(stripPositions(page.children[0])).toEqual({
      type: "title",
      value: "ページタイトル",
      children: [{ type: "text", value: "ページタイトル" }],
    })
    expect(page.children[1]?.type).toBe("line")
  })

  it("タイトル行の記法は読まず、書いたままの文字 1 つになる (Cosense Web と同じ)", () => {
    const title = parse("[リンク] と #tag `code` [* 太字]\n本文").children[0]
    expect(stripPositions(title)).toEqual({
      type: "title",
      value: "[リンク] と #tag `code` [* 太字]",
      children: [{ type: "text", value: "[リンク] と #tag `code` [* 太字]" }],
    })
  })

  it("拡張の記法もタイトル行では読まない", () => {
    const atFormula: Extension = {
      bracketRules: [(inner) => (inner.startsWith("@") ? { type: "formula", value: inner } : null)],
    }
    const title = parse("[@x]\n本文", { extensions: [atFormula] }).children[0]
    expect(stripPositions(title?.type === "title" ? title.children : [])).toEqual([
      { type: "text", value: "[@x]" },
    ])
  })

  it("タイトルの文字はタイトル行全体の位置を持つ", () => {
    const source = "[リンク] の話\n本文"
    const title = parse(source).children[0]
    expect(title?.type === "title" ? title.children[0]?.position : undefined).toEqual(
      at(source, "[リンク] の話"),
    )
  })

  it("タイトル行は code: や table: として解釈しない", () => {
    expect(parse("code:main.ts").children[0]?.type).toBe("title")
    expect(parse("table:data").children[0]?.type).toBe("title")
  })

  it("空文字列でも空のタイトル 1 つを返す", () => {
    const page = parse("")
    expect(page.children).toHaveLength(1)
    expect(stripPositions(page.children[0])).toEqual({ type: "title", value: "", children: [] })
  })

  it("CRLF は LF として扱う", () => {
    const page = parse("title\r\nfoo")
    expect(page.children).toHaveLength(2)
    expect(stripPositions(blockAt(page.children, 1, "line").children)).toEqual([
      { type: "text", value: "foo" },
    ])
  })
})

describe("行", () => {
  it("行頭の空白をインデントとして数える", () => {
    expect(blockAt(body("  foo"), 0, "line").indent).toBe(2)
    expect(blockAt(body("\t\tfoo"), 0, "line").indent).toBe(2)
    expect(blockAt(body("　foo"), 0, "line").indent).toBe(1)
  })

  it("> で始まる行は引用になり記号は本文に含まれない", () => {
    const line = blockAt(body("> 引用文"), 0, "line")
    expect(line.quote).toBe(true)
    expect(stripPositions(line.children)).toEqual([{ type: "text", value: "引用文" }])
  })

  it("行頭が $ や % と空白の行は、コマンドとして等幅になる", () => {
    expect(blockAt(body("$ x = 1"), 0, "line").monospace).toBe(true)
    expect(blockAt(body("% x = 1"), 0, "line").monospace).toBe(true)
    expect(blockAt(body("x = 1"), 0, "line").monospace).toBe(false)
  })

  it("コマンドの行は記法を読まず、書いたままの文字 1 つになる (Cosense Web と同じ)", () => {
    expect(
      stripPositions(blockAt(body("$ npm install [リンク] `x` #tag"), 0, "line").children),
    ).toEqual([{ type: "text", value: "$ npm install [リンク] `x` #tag" }])
  })

  it("字下げした行も、字下げの後が $ と空白ならコマンドになる", () => {
    expect(blockAt(body("  $ ls"), 0, "line").monospace).toBe(true)
  })

  it("$ や % の後に空白が無ければ、コマンドにならない", () => {
    expect(blockAt(body("$aa"), 0, "line").monospace).toBe(false)
  })

  it("$ と空白の後に何も無ければ、コマンドにならない", () => {
    expect(blockAt(body("$ "), 0, "line").monospace).toBe(false)
  })

  it("行の途中の $ はコマンドにならない", () => {
    expect(blockAt(body("a$ aa"), 0, "line").monospace).toBe(false)
  })

  it("引用の行の $ はコマンドにならない", () => {
    expect(blockAt(body("> $ ls"), 0, "line").monospace).toBe(false)
  })

  it("空行は子を持たない行になる", () => {
    const line = blockAt(body(""), 0, "line")
    expect(line.children).toEqual([])
    expect(line.indent).toBe(0)
  })
})

describe("code: ブロック", () => {
  it("ヘッダより深いインデントの行を本体としてまとめる", () => {
    const blocks = body("code:main.ts", " const a = 1", " const b = 2", "あと")
    const code = blockAt(blocks, 0, "codeBlock")
    expect(code.filename).toBe("main.ts")
    expect(code.indent).toBe(0)
    expect(code.lines.map((l) => l.value)).toEqual(["const a = 1", "const b = 2"])
    expect(blocks).toHaveLength(2)
    expect(blockAt(blocks, 1, "line").children).toHaveLength(1)
  })

  it("本体行はブロックの相対インデントを保つ", () => {
    const code = blockAt(
      body("code:main.ts", " function f() {", "   return 1", " }"),
      0,
      "codeBlock",
    )
    expect(code.lines.map((l) => l.value)).toEqual(["function f() {", "  return 1", "}"])
  })

  it("インデントされたヘッダの本体はさらに深い行になる", () => {
    const code = blockAt(body(" code:main.ts", "  const a = 1", " 出た"), 0, "codeBlock")
    expect(code.indent).toBe(1)
    expect(code.lines.map((l) => l.value)).toEqual(["const a = 1"])
  })

  it("本体の中の記法は解釈しない", () => {
    const code = blockAt(body("code:main.ts", " [リンク] `code` #tag"), 0, "codeBlock")
    expect(code.lines[0]?.value).toBe("[リンク] `code` #tag")
  })

  it("本体が無くてもコードブロックになる", () => {
    const code = blockAt(body("code:empty.txt"), 0, "codeBlock")
    expect(code.lines).toEqual([])
  })

  it("コードブロックの中では table: を解釈しない", () => {
    const code = blockAt(body("code:main.ts", " table:notATable"), 0, "codeBlock")
    expect(code.lines.map((l) => l.value)).toEqual(["table:notATable"])
  })

  it("コードブロックを抜けた直後の table: は解釈する", () => {
    const blocks = body("code:main.ts", " const a = 1", "table:data", " a\tb")
    expect(blocks).toHaveLength(2)
    expect(blockAt(blocks, 1, "table").name).toBe("data")
  })
})

describe("table: ブロック", () => {
  it("ヘッダより深いインデントの行をタブ区切りの行としてまとめる", () => {
    const table = blockAt(body("table:data", " a\tb", " c\td", "あと"), 0, "table")
    expect(table.name).toBe("data")
    expect(table.indent).toBe(0)
    expect(table.rows.map((r) => r.cells.map((c) => c.value))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("本体が無くてもテーブルになる", () => {
    expect(blockAt(body("table:empty"), 0, "table").rows).toEqual([])
  })

  it("セル数が揃っていなくてもそのまま保持する", () => {
    const table = blockAt(body("table:ragged", " a\tb\tc", " d"), 0, "table")
    expect(table.rows.map((r) => r.cells.length)).toEqual([3, 1])
  })

  it("セルの value は書いたままの文字を保つ", () => {
    const table = blockAt(body("table:data", " [* 太字]\t[リンク]"), 0, "table")
    expect(table.rows[0]?.cells.map((c) => c.value)).toEqual(["[* 太字]", "[リンク]"])
  })

  it("既定では、セルの中はリンクの記法だけを読む (Cosense Web と同じ)", () => {
    const table = blockAt(body("table:data", " [* 太字] `code` [リンク]"), 0, "table")
    expect(stripPositions(table.rows[0]?.cells[0]?.children)).toEqual([
      { type: "text", value: "[* 太字] `code` " },
      { type: "internalLink", label: "リンク", target: "リンク" },
    ])
  })

  it("拡張 tableCellNotation() を渡すと、セルの中でも行と同じくすべての記法を読む", () => {
    const page = parse("title\ntable:data\n [* 太字]\t`code` [リンク]", {
      extensions: [tableCellNotation()],
    })
    const table = blockAt(page.children.slice(1), 0, "table")
    expect(stripPositions(table.rows[0]?.cells.map((c) => c.children))).toEqual([
      stripPositions(parseLine("[* 太字]").children),
      stripPositions(parseLine("`code` [リンク]").children),
    ])
  })

  it("tableCellNotation にノード型を並べると、リンクに加えてその型だけを読む", () => {
    const page = parse("title\ntable:data\n [* 太字 [リンク]] `code` [$ x]", {
      extensions: [tableCellNotation(["decoration"])],
    })
    const table = blockAt(page.children.slice(1), 0, "table")
    expect(stripPositions(table.rows[0]?.cells[0]?.children)).toMatchObject([
      {
        type: "decoration",
        markers: ["*"],
        children: [
          { type: "text", value: "太字 " },
          { type: "internalLink", label: "リンク", target: "リンク" },
        ],
      },
      { type: "text", value: " `code` [$ x]" },
    ])
  })

  it("tableCellNotation と一緒に渡した拡張の記法も、セルの中で読む", () => {
    const atFormula: Extension = {
      bracketRules: [(inner) => (inner.startsWith("@") ? { type: "formula", value: inner } : null)],
    }
    const extensions = [atFormula, tableCellNotation()]
    const page = parse("title\ntable:data\n [@x]", { extensions })
    const table = blockAt(page.children.slice(1), 0, "table")
    expect(stripPositions(table.rows[0]?.cells[0]?.children)).toEqual(
      stripPositions(parseLine("[@x]", { extensions }).children),
    )
  })

  it("拡張の keepInTableCell が true を返したノードは、セルの中でも記法として残す", () => {
    const keepCode: Extension = { keepInTableCell: (node) => node.type === "inlineCode" }
    const page = parse("title\ntable:data\n `code` [$ x]", { extensions: [keepCode] })
    const table = blockAt(page.children.slice(1), 0, "table")
    expect(table.rows[0]?.cells[0]?.children.map((child) => child.type)).toEqual([
      "inlineCode",
      "text",
    ])
  })

  it("同じインデントの行でテーブルが終わる", () => {
    const blocks = body("table:data", " a\tb", "通常行")
    expect(blocks).toHaveLength(2)
    expect(blockAt(blocks, 1, "line").children).toHaveLength(1)
  })
})

describe("parseLine", () => {
  it("1 行を通常行として解析する", () => {
    const line = parseLine("  > [リンク]")
    expect(line.type).toBe("line")
    expect(line.indent).toBe(2)
    expect(line.quote).toBe(true)
    expect(stripPositions(line.children)).toEqual([
      { type: "internalLink", label: "リンク", target: "リンク" },
    ])
  })

  it("origin を渡すとページ内の位置として報告する", () => {
    const line = parseLine("foo", { line: 3, offset: 42 })
    expect(line.position.start).toEqual({ line: 3, column: 0, offset: 42 })
    expect(line.children[0]?.position.start).toEqual({ line: 3, column: 0, offset: 42 })
  })

  it("parse が返す行と同じ結果になる", () => {
    const source = "title\n  [リンク] と #tag"
    const fromPage: LineBlock = blockAt(parse(source).children, 1, "line")
    const fromLine = parseLine("  [リンク] と #tag", { line: 1, offset: "title\n".length })
    expect(fromLine).toEqual(fromPage)
  })
})

describe("ブロックの境界", () => {
  it("code: と table: が続いてもそれぞれのブロックになる", () => {
    const blocks = body("code:a.ts", " x", "table:t", " 1\t2", "終わり")
    expect(blocks.map((b) => b.type)).toEqual(["codeBlock", "table", "line"])
    expect((blocks[0] as CodeBlock).lines).toHaveLength(1)
    expect((blocks[1] as TableBlock).rows).toHaveLength(1)
  })
})

describe("装飾のマーカー", () => {
  it("見た目の付く装飾記号がそのまま markers に残る", () => {
    const node = firstInline("[*-/ x]")
    expect(node).toMatchObject({ type: "decoration", markers: ["*", "-", "/"] })
  })

  it("繰り返した記号は 1 つにまとめる", () => {
    expect(firstInline("[*** 見出し]")).toMatchObject({ markers: ["*"], sizeLevel: 2 })
  })

  it("見た目の付く記号とほかの Cosense の記号を混ぜた並びも、書いた順に markers に残る", () => {
    expect(firstInline("[*'(#%& x]")).toMatchObject({
      type: "decoration",
      markers: ["*", "'", "(", "#", "%", "&"],
    })
  })

  it("見た目の付かない記号は、太字や斜体などのフラグを立てない", () => {
    expect(firstInline("[!\"#%&'()+,.{|}<>~= x]")).toMatchObject({
      type: "decoration",
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      sizeLevel: 0,
    })
  })
})
