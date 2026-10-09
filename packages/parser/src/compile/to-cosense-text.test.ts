import { describe, expect, it } from "vitest"

import { tableCellNotation } from "../extensions"
import { parse, parseLine } from "../parse"
import type { AnyNode } from "../types"
import { type CosenseTextExtension, toCosenseText } from "./to-cosense-text"

/** 本文 1 行を書き出す。 */
const line = (source: string): string => toCosenseText(parseLine(source))

describe("ページ", () => {
  it("タイトルと本文の行を、改行でつないで書き出す", () => {
    expect(toCosenseText(parse("タイトル\na\n\nb"))).toBe("タイトル\na\n\nb")
  })

  it("字下げは、深さの数だけ半角空白を並べる", () => {
    expect(toCosenseText(parse("t\n  a"))).toBe("t\n  a")
  })

  it("全角空白やタブの字下げは、半角空白にそろえる", () => {
    expect(toCosenseText(parse("t\n　a\n\tb"))).toBe("t\n a\n b")
  })

  it("引用の行は、字下げの後に > と空白を置く", () => {
    expect(toCosenseText(parse("t\n >a"))).toBe("t\n > a")
  })

  it("コマンドの行は、書いたとおりに書き出す", () => {
    expect(toCosenseText(parse("t\n $ npm i"))).toBe("t\n $ npm i")
  })

  it("コードブロックは、中の行をブロックより 1 段深く字下げする", () => {
    expect(toCosenseText(parse("t\n code:a.js\n  x\n    y"))).toBe("t\n code:a.js\n  x\n    y")
  })

  it("表は、行をブロックより 1 段深く字下げし、セルをタブで区切る", () => {
    expect(toCosenseText(parse("t\ntable:名前\n a\tb\n c\td"))).toBe("t\ntable:名前\n a\tb\n c\td")
  })
})

describe("リンク", () => {
  it("ページへのリンクは [タイトル]", () => {
    expect(line("[ページ]")).toBe("[ページ]")
  })

  it("ラベルのある外部リンクは、ラベルを前に置いた [ラベル URL]", () => {
    expect(line("[https://example.com 例]")).toBe("[例 https://example.com]")
  })

  it("URL だけの外部リンクは、括弧で囲んだ [URL]", () => {
    expect(line("https://example.com")).toBe("[https://example.com]")
  })

  it("別のプロジェクトへのリンクは [/project/title]", () => {
    expect(line("[/help-jp/ページ]")).toBe("[/help-jp/ページ]")
  })

  it("ハッシュタグは #tag", () => {
    expect(line("#tag")).toBe("#tag")
  })
})

describe("文字の装飾", () => {
  it("装飾は、記号と中身を [記号 中身] にする", () => {
    expect(line("[/ a]")).toBe("[/ a]")
  })

  it("大きい文字は、段階の数だけ * を重ねる", () => {
    expect(line("[*** a]")).toBe("[*** a]")
  })

  it("複数の記号は、書かれた順に並べる", () => {
    expect(line("[-* a]")).toBe("[-* a]")
  })

  it("[[強調]] は、同じ意味の [* 強調] にする", () => {
    expect(line("[[a]]")).toBe("[* a]")
  })

  it("装飾の中のリンクも書き出す", () => {
    expect(line("[* [ページ] と]")).toBe("[* [ページ] と]")
  })
})

describe("そのほかのインライン記法", () => {
  it("インラインコードはバッククォートで囲む", () => {
    expect(line("`a`")).toBe("`a`")
  })

  it("数式は [$ 数式]", () => {
    expect(line("[$ x^2]")).toBe("[$ x^2]")
  })

  it("アイコンは [user.icon]", () => {
    expect(line("[qaynam.icon]")).toBe("[qaynam.icon]")
  })

  it("2 つ以上並べたアイコンは、個数を付けた [user.icon*N]", () => {
    expect(line("[qaynam.icon*3]")).toBe("[qaynam.icon*3]")
  })

  it("画像は [画像の URL]", () => {
    expect(line("[https://example.com/a.png]")).toBe("[https://example.com/a.png]")
  })

  it("大きい画像は [[画像の URL]]", () => {
    expect(line("[[https://example.com/a.png]]")).toBe("[[https://example.com/a.png]]")
  })

  it("リンク付きの画像は [リンク先 画像の URL]", () => {
    expect(line("[https://example.com https://example.com/a.png]")).toBe(
      "[https://example.com https://example.com/a.png]",
    )
  })

  it("動画は [動画の URL]", () => {
    expect(line("[https://example.com/a.mp4]")).toBe("[https://example.com/a.mp4]")
  })

  it("ラベルのある音声は [ラベル 音声の URL]", () => {
    expect(line("[https://example.com/a.mp3 曲]")).toBe("[曲 https://example.com/a.mp3]")
  })

  it("埋め込みは、書かれた URL を括弧で囲む", () => {
    expect(line("[https://www.youtube.com/watch?v=abc]")).toBe(
      "[https://www.youtube.com/watch?v=abc]",
    )
  })

  it("地図は、ラベルと緯度・経度・ズームを [ラベル N緯度,E経度,Zズーム] にする", () => {
    expect(line("[東京駅 N35.68,E139.76,Z14]")).toBe("[東京駅 N35.68,E139.76,Z14]")
  })

  it("南緯と西経は、S と W に正の数を付ける", () => {
    expect(line("[S1.5,W2]")).toBe("[S1.5,W2]")
  })
})

describe("handlers (置き換え)", () => {
  it("handlers に渡した型だけが、そのハンドラの出力に置き換わる", () => {
    expect(
      toCosenseText(parseLine("[* a] [b]"), { handlers: { internalLink: (node) => node.label } }),
    ).toBe("[* a] b")
  })

  it("ctx.children は、子をそれぞれ書き出した文字列を並べて返す", () => {
    expect(
      toCosenseText(parseLine("[* a[b]]"), {
        handlers: { decoration: (node, ctx) => ctx.children(node).join("|") },
      }),
    ).toBe("a|[b]")
  })
})

describe("ctx.ancestors (祖先のノード)", () => {
  it("根から親までのノードが並んで渡る", () => {
    const seen: string[][] = []
    toCosenseText(parse("t\ntable:x\n [* a]", { extensions: [tableCellNotation()] }), {
      extensions: [
        {
          text: (output, _node, ctx) => {
            seen.push(ctx.ancestors.map((node) => node.type))
            return output
          },
        },
      ],
    })
    expect(seen).toEqual([["page", "table", "tableRow", "tableCell", "decoration"]])
  })
})

describe("extensions (出力の加工)", () => {
  it("拡張はそのノード型の出力を受け取り、返した値が新しい出力になる", () => {
    expect(
      toCosenseText(parseLine("[*** a]"), {
        extensions: [{ decoration: (output) => output.replace(/^\[\*+/, "[**") }],
      }),
    ).toBe("[** a]")
  })

  it("並べた順に重なる。前の拡張の出力が次の拡張に渡る", () => {
    expect(
      toCosenseText(parseLine("`a`"), {
        extensions: [
          { inlineCode: (output) => `${output}1` },
          { inlineCode: (output) => `${output}2` },
        ],
      }),
    ).toBe("`a`12")
  })

  it("handlers で置き換えた出力を受け取る (handlers の後に動く)", () => {
    expect(
      toCosenseText(parseLine("`a`"), {
        handlers: { inlineCode: (node) => node.value },
        extensions: [{ inlineCode: (output) => `<${output}>` }],
      }),
    ).toBe("<a>")
  })

  it("子の書き出し (ctx.children) にも拡張が効く", () => {
    expect(
      toCosenseText(parseLine("[* a]"), {
        extensions: [{ text: (output) => output.toUpperCase() }],
      }),
    ).toBe("[* A]")
  })
})

describe("独自のノード", () => {
  const mention = {
    type: "mention",
    children: [{ type: "text", value: "qaynam" }],
  } as unknown as AnyNode

  it("ハンドラの無い独自ノードは、子を書き出してつなぐ", () => {
    expect(toCosenseText(mention)).toBe("qaynam")
  })

  it("ハンドラの無い独自ノードにも、拡張が効く", () => {
    expect(
      toCosenseText(mention, {
        extensions: [{ mention: (output: string) => `@${output}` } as CosenseTextExtension],
      }),
    ).toBe("@qaynam")
  })
})
