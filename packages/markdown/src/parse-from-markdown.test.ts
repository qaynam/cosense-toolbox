import { toCosenseText } from "@cosense-toolbox/parser/compile"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { markdownToCosenseText, parseFromMarkdown } from "./parse-from-markdown"

// 期待値の 1 行目はタイトル。Markdown が # の見出しで始まらなければ、タイトルは空になる。
// Markdown の記法ごとの対応は @cosense-toolbox/parser/markdown の fromMdast が決めるので、
// ここでは文字列から読むときに足しているもの (GFM と数式の読み方、オプション) だけを確かめる。

describe("parseFromMarkdown", () => {
  it("Markdown の文字列を読んで、Cosense のページの AST にする", () => {
    expect(toCosenseText(parseFromMarkdown("# タイトル\n\n**a**"))).toBe("タイトル\n[* a]")
  })

  it("position は、Markdown の中の位置を指す", () => {
    expect(parseFromMarkdown("a\n\n**b**").children[3]?.position.start).toEqual({
      line: 2,
      column: 0,
      offset: 3,
    })
  })

  it("math: false を渡すと、$ で囲んだ文字を数式にしない", () => {
    expect(toCosenseText(parseFromMarkdown("$x$", { math: false }))).toBe("\n$x$")
  })

  it("どんな文字列を渡しても、例外を投げずにページを返す", () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(..."*_~`$[]()!#>-|:\\ \n\t1.ax") }), (md) => {
        expect(parseFromMarkdown(md).type).toBe("page")
      }),
    )
  })
})

describe("GFM", () => {
  it("表を読む", () => {
    expect(markdownToCosenseText("| a |\n| - |")).toBe("\ntable:table\n a")
  })

  it("打ち消し線を読む", () => {
    expect(markdownToCosenseText("~~a~~")).toBe("\n[- a]")
  })

  it("タスクの箇条書きを読む", () => {
    expect(markdownToCosenseText("- [x] a")).toBe("\n ☑ a")
  })

  it("文の中の URL をリンクとして読む", () => {
    expect(markdownToCosenseText("見て https://example.com")).toBe("\n見て [https://example.com]")
  })
})

describe("$ で囲んだ数式 (pandoc と同じ決まり)", () => {
  it("$ で囲んだ数式は [$ ] になる", () => {
    expect(markdownToCosenseText("$x^2$")).toBe("\n[$ x^2]")
  })

  it("1 つの文に数式が 2 つあっても、それぞれ数式になる", () => {
    expect(markdownToCosenseText("$x$と$y$")).toBe("\n[$ x]と[$ y]")
  })

  it("閉じる $ のすぐ後が数字なら、値段とみなして文字のまま残す", () => {
    expect(markdownToCosenseText("$5と$10")).toBe("\n$5と$10")
  })

  it("閉じる $ のすぐ前が空白なら、数式にしない", () => {
    expect(markdownToCosenseText("$a $")).toBe("\n$a $")
  })

  it("開く $ のすぐ後が空白なら、数式にしない", () => {
    expect(markdownToCosenseText("$ a$")).toBe("\n$ a$")
  })

  it("$$ で囲んだ数式は値段と紛れないので、すぐ後が数字でも数式にする", () => {
    expect(markdownToCosenseText("式 $$x$$2 です")).toBe("\n式 [$ x]2 です")
  })

  it("数式にしなかった $ の前後の文字は、そのまま残る", () => {
    expect(markdownToCosenseText("**a** $5と$10 [b](https://example.com)")).toBe(
      "\n[* a] $5と$10 [b https://example.com]",
    )
  })

  it("$$ のブロックは数式になる", () => {
    expect(markdownToCosenseText("$$\nx\n$$")).toBe("\n[$ x]")
  })
})

describe("math オプション", () => {
  it("math: false なら、$ で囲んだ文字を数式にしない", () => {
    expect(markdownToCosenseText("$x^2$", { math: false })).toBe("\n$x^2$")
  })

  it("math: false なら、$$ のブロックも数式にしない", () => {
    expect(markdownToCosenseText("$$\nx\n$$", { math: false })).toBe("\n$$\nx\n$$")
  })
})

describe("markdownToCosenseText", () => {
  it("toCosenseText と同じ extensions を受け取り、書き出しを変える", () => {
    expect(
      markdownToCosenseText("### a", {
        extensions: [{ decoration: (output) => output.replace("***", "**") }],
      }),
    ).toBe("\n[** a]")
  })

  it("toCosenseText と同じ handlers を受け取り、書き出しを変える", () => {
    expect(
      markdownToCosenseText("[a](https://example.com)", {
        handlers: { externalLink: (node) => node.target },
      }),
    ).toBe("\nhttps://example.com")
  })
})
