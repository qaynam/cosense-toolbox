import { toCosenseText } from "@cosense-toolbox/parser/compile"
import { isPage } from "@cosense-toolbox/parser/schema"
import fc from "fast-check"
import type { Root } from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { mathFromMarkdown } from "mdast-util-math"
import { gfm } from "micromark-extension-gfm"
import { math } from "micromark-extension-math"
import { describe, expect, it } from "vitest"

import { fromMdast } from "./from-mdast"

/** 位置情報を除いた形。構造だけを具体的な値で比べるため。 */
const stripPositions = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key: string, field: unknown) =>
      key === "position" ? undefined : field,
    ),
  )

const mdastOf = (markdown: string): Root =>
  fromMarkdown(markdown, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  })

/**
 * Markdown から作ったページを、Cosense の記法で書き出す。
 * 期待値の 1 行目はタイトル。Markdown が # の見出しで始まらなければ、タイトルは空になる。
 */
const cosenseOf = (markdown: string): string => toCosenseText(fromMdast(mdastOf(markdown)))

/** 本文の n 行目 (タイトルの次が 1) の AST を、位置情報を除いて返す。 */
const bodyLineOf = (markdown: string, n = 1) =>
  stripPositions(fromMdast(mdastOf(markdown)).children[n])

describe("ページの構造", () => {
  it("先頭の # の見出しはタイトルになる", () => {
    expect(cosenseOf("# タイトル\n\n本文")).toBe("タイトル\n本文")
  })

  it("見出しで始まらなければ、タイトルは空になる", () => {
    expect(cosenseOf("本文")).toBe("\n本文")
  })

  it("空の Markdown は、タイトルだけの空のページになる", () => {
    expect(cosenseOf("")).toBe("")
  })

  it("段落の中の改行は、そのまま行の区切りになる", () => {
    expect(cosenseOf("a\nb")).toBe("\na\nb")
  })

  it("行末の \\ で入れた改行も、行の区切りになる", () => {
    expect(cosenseOf("a\\\nb")).toBe("\na\nb")
  })

  it("段落と段落の間は空行になる", () => {
    expect(cosenseOf("a\n\nb")).toBe("\na\n\nb")
  })

  it("段落の後の箇条書きは、空行を挟まずに続く", () => {
    expect(cosenseOf("前\n\n- a")).toBe("\n前\n a")
  })

  it("区切り線は、前後の段落の間の空行になる", () => {
    expect(cosenseOf("a\n\n---\n\nb")).toBe("\na\n\nb")
  })
})

describe("見出し", () => {
  it("深い見出しほど小さい文字の装飾になり、見出しの後は空行を挟まない", () => {
    expect(cosenseOf("# t\n\n## 大\n\n### 中\n\n#### 小\n\n本文")).toBe(
      "t\n[**** 大]\n[*** 中]\n[** 小]\n本文",
    )
  })

  it("##### より深い見出しは、太字になる", () => {
    expect(cosenseOf("##### a")).toBe("\n[* a]")
  })

  it("中身の無い見出しは、空行になる", () => {
    expect(cosenseOf("a\n\n##")).toBe("\na\n\n")
  })

  it("2 つ目からの # の見出しは、いちばん大きい文字の装飾になる", () => {
    expect(cosenseOf("# a\n\n# b")).toBe("a\n[***** b]")
  })

  it("見出しの前には空行を挟む", () => {
    expect(cosenseOf("本文\n\n## 次")).toBe("\n本文\n\n[**** 次]")
  })
})

describe("箇条書き", () => {
  it("箇条書きは字下げになり、入れ子は深い字下げになる", () => {
    expect(cosenseOf("- a\n  - b\n- c")).toBe("\n a\n  b\n c")
  })

  it("番号付きの箇条書きは、番号を残す", () => {
    expect(cosenseOf("3. a\n4. b")).toBe("\n 3. a\n 4. b")
  })

  it("タスクの箇条書きは、チェックの印を残す", () => {
    expect(cosenseOf("- [ ] a\n- [x] b")).toBe("\n ☐ a\n ☑ b")
  })

  it("項目の中のコードブロックは、項目と同じ深さに置く", () => {
    expect(cosenseOf("- a\n\n  ```js\n  x\n  ```")).toBe("\n a\n code:js\n  x")
  })

  it("コードブロックの後の箇条書きは、コードの中身として読まれないよう空行で区切る", () => {
    expect(cosenseOf("```\nx\n```\n\n- a")).toBe("\ncode:text\n x\n\n a")
  })

  it("表の後の箇条書きは、表の行として読まれないよう空行で区切る", () => {
    expect(cosenseOf("| h |\n| - |\n\n- a")).toBe("\ntable:table\n h\n\n a")
  })

  it("項目の中のコードブロックの後に入れ子の箇条書きが来ても、空行で区切る", () => {
    expect(cosenseOf("- ```js\n  x\n  ```\n  - b")).toBe("\n code:js\n  x\n\n  b")
  })

  it("番号付きの項目がコードブロックで始まるときは、番号だけの行を前に置く", () => {
    expect(cosenseOf("1. ```js\n   x\n   ```")).toBe("\n 1.\n code:js\n  x")
  })
})

describe("インライン", () => {
  it("太字・斜体・打ち消し線は、文字の装飾になる", () => {
    expect(cosenseOf("**a** *b* ~~c~~")).toBe("\n[* a] [/ b] [- c]")
  })

  it("ちょうど重なった装飾は、記号をまとめた 1 つの装飾になる", () => {
    expect(cosenseOf("**_a_**")).toBe("\n[*/ a]")
  })

  it("装飾の中の装飾は、Cosense では入れ子にできないので外す", () => {
    expect(cosenseOf("**a *b* c**")).toBe("\n[* a b c]")
  })

  it("装飾の中の改行は、Cosense の装飾が 1 行に収まるよう空白にする", () => {
    expect(cosenseOf("**a\nb**")).toBe("\n[* a b]")
  })

  it("装飾の中のリンクは残す", () => {
    expect(cosenseOf("**[x](https://example.com)**")).toBe("\n[* [x https://example.com]]")
  })

  it("リンクは、ラベルと URL を並べた外部リンクになる", () => {
    expect(cosenseOf("[例](https://example.com)")).toBe("\n[例 https://example.com]")
  })

  it("リンクのラベルの装飾は外す", () => {
    expect(cosenseOf("[**例**](https://example.com)")).toBe("\n[例 https://example.com]")
  })

  it("URL だけのリンクは、URL を括弧で囲む", () => {
    expect(cosenseOf("<https://example.com>")).toBe("\n[https://example.com]")
  })

  it("文の中の URL も、URL を括弧で囲む", () => {
    expect(cosenseOf("見て https://example.com")).toBe("\n見て [https://example.com]")
  })

  it("参照の形のリンクも、URL を引いてリンクにする", () => {
    expect(cosenseOf("[a][1]\n\n[1]: https://example.com")).toBe("\n[a https://example.com]")
  })

  it("http でない URL へのリンクは、Cosense ではリンクにならないので文字だけを出す", () => {
    expect(cosenseOf("[a](/x)")).toBe("\na")
  })

  it("画像は、画像の URL を括弧で囲む", () => {
    expect(cosenseOf("![alt](https://example.com/a.png)")).toBe("\n[https://example.com/a.png]")
  })

  it("リンク付きの画像は、リンク先と画像の URL を並べる", () => {
    expect(cosenseOf("[![](https://example.com/a.png)](https://example.com)")).toBe(
      "\n[https://example.com https://example.com/a.png]",
    )
  })

  it("インラインコードはインラインコードになる", () => {
    expect(cosenseOf("`a*b`")).toBe("\n`a*b`")
  })

  it("$ で囲んだ数式は [$ ] になる", () => {
    expect(cosenseOf("$x^2$")).toBe("\n[$ x^2]")
  })
})

describe("ブロック", () => {
  it("コードブロックは code: になり、中の空行も字下げを保つ", () => {
    expect(cosenseOf("```js\nconst a = 1\n\nb\n```")).toBe("\ncode:js\n const a = 1\n \n b")
  })

  it("言語名の後にファイル名があれば、ファイル名を使う", () => {
    expect(cosenseOf("```js a.js\nx\n```")).toBe("\ncode:a.js\n x")
  })

  it("言語名の無いコードブロックは code:text になる", () => {
    expect(cosenseOf("```\nx\n```")).toBe("\ncode:text\n x")
  })

  it("4 つの空白で字下げした行は、コードブロックになる", () => {
    expect(cosenseOf("    x")).toBe("\ncode:text\n x")
  })

  it("引用は > の行になる", () => {
    expect(cosenseOf("> a\n> b")).toBe("\n> a\n> b")
  })

  it("表は table: になり、セルはタブで区切る", () => {
    expect(cosenseOf("| a | b |\n| - | - |\n| 1 | 2 |")).toBe("\ntable:table\n a\tb\n 1\t2")
  })

  it("表のセルの中のタブは、セルの区切りと紛れないよう空白にする", () => {
    expect(cosenseOf("| a\tb |\n| - |")).toBe("\ntable:table\n a b")
  })

  it("$$ で囲んだブロックの数式は [$ ] になる", () => {
    expect(cosenseOf("$$\nx_i\n$$")).toBe("\n[$ x_i]")
  })

  it("複数行のブロックの数式は、空白でつないだ 1 行の [$ ] になる", () => {
    expect(cosenseOf("$$\na\nb\n$$")).toBe("\n[$ a b]")
  })
})

describe("書きかけや誤りのある Markdown", () => {
  it("閉じていない太字の記号は、記号のまま文字になる", () => {
    expect(cosenseOf("**a")).toBe("\n**a")
  })

  it("閉じていないフェンスは、文書の終わりまでコードブロックになる", () => {
    expect(cosenseOf("```js\na\nb")).toBe("\ncode:js\n a\n b")
  })

  it("区切りの行と列の数が合わない表は、表にならず文字のまま残る", () => {
    expect(cosenseOf("| a | b |\n| - |")).toBe("\n| a | b |\n| - |")
  })

  it("バックスラッシュで逃がした記号は、記号の文字になる", () => {
    expect(cosenseOf("\\*a\\*")).toBe("\n*a*")
  })
})

describe("Cosense の AST", () => {
  it("Markdown の文字の [ ] や # は、Markdown のとおり文字のノードになる", () => {
    expect(bodyLineOf("[ページ] と #tag")).toEqual({
      type: "line",
      indent: 0,
      quote: false,
      monospace: false,
      children: [{ type: "text", value: "[ページ] と #tag" }],
    })
  })

  it("HTML のタグは、文字のノードになる", () => {
    expect(bodyLineOf("<b>a</b>")).toEqual({
      type: "line",
      indent: 0,
      quote: false,
      monospace: false,
      children: [
        { type: "text", value: "<b>" },
        { type: "text", value: "a" },
        { type: "text", value: "</b>" },
      ],
    })
  })

  it("見出しは、大きさの段階を持つ太字の装飾になる", () => {
    expect(bodyLineOf("### a")).toEqual({
      type: "line",
      indent: 0,
      quote: false,
      monospace: false,
      children: [
        {
          type: "decoration",
          value: "a",
          markers: ["*"],
          bold: true,
          italic: false,
          strike: false,
          underline: false,
          sizeLevel: 2,
          children: [{ type: "text", value: "a" }],
        },
      ],
    })
  })

  it("装飾の value は、中身を Cosense の記法で書いた文字になる", () => {
    expect(bodyLineOf("~~[x](https://example.com) y~~")).toMatchObject({
      children: [{ type: "decoration", value: "[x https://example.com] y" }],
    })
  })

  it("表のセルは、Markdown の装飾も読む", () => {
    expect(bodyLineOf("| **a** |\n| - |")).toMatchObject({
      rows: [
        {
          cells: [
            { type: "tableCell", value: "[* a]", children: [{ type: "decoration", value: "a" }] },
          ],
        },
      ],
    })
  })

  it("タイトルは、見出しの文字を value と text の子に持つ", () => {
    expect(stripPositions(fromMdast(mdastOf("# *a* b")).children[0])).toEqual({
      type: "title",
      value: "a b",
      children: [{ type: "text", value: "a b" }],
    })
  })
})

describe("位置情報", () => {
  it("ノードの position は、元になった Markdown の中の位置を指す", () => {
    expect(fromMdast(mdastOf("a\n\n**b**")).children[3]?.position).toEqual({
      start: { line: 2, column: 0, offset: 3 },
      end: { line: 2, column: 5, offset: 8 },
    })
  })

  it("Markdown に無い空のタイトルは、先頭の幅 0 の位置を持つ", () => {
    expect(fromMdast(mdastOf("a")).children[0]?.position).toEqual({
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 },
    })
  })
})

describe("全域性", () => {
  it("どんな Markdown から作っても、Page の形を満たす", () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(..."*_~`$[]()!#>-|:\\ \n\t1.ax") }), (md) => {
        expect(isPage(fromMdast(mdastOf(md)))).toBe(true)
      }),
    )
  })
})
