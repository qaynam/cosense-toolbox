import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { tableCellNotation } from "../extensions"
import { parse } from "../parse"
import { markdownToCosenseText, parseFromMarkdown } from "./parse-from-markdown"

// 期待値の 1 行目はタイトル。Markdown が # の見出しで始まらなければ、タイトルは空になる。

describe("ページの構造", () => {
  it("先頭の # の見出しはタイトルになる", () => {
    expect(markdownToCosenseText("# タイトル\n\n本文")).toBe("タイトル\n本文")
  })

  it("見出しで始まらなければ、タイトルは空になる", () => {
    expect(markdownToCosenseText("本文")).toBe("\n本文")
  })

  it("空の Markdown は空のページになる", () => {
    expect(markdownToCosenseText("")).toBe("")
  })

  it("段落の中の改行は、そのまま行の区切りになる", () => {
    expect(markdownToCosenseText("a\nb")).toBe("\na\nb")
  })

  it("行末の \\ で入れた改行も、行の区切りになる", () => {
    expect(markdownToCosenseText("a\\\nb")).toBe("\na\nb")
  })

  it("段落と段落の間は空行になる", () => {
    expect(markdownToCosenseText("a\n\nb")).toBe("\na\n\nb")
  })

  it("段落の後の箇条書きは、空行を挟まずに続く", () => {
    expect(markdownToCosenseText("前\n\n- a")).toBe("\n前\n a")
  })

  it("区切り線は、前後の段落の間の空行になる", () => {
    expect(markdownToCosenseText("a\n\n---\n\nb")).toBe("\na\n\nb")
  })
})

describe("見出し", () => {
  it("深い見出しほど小さい文字の装飾になり、見出しの後は空行を挟まない", () => {
    expect(markdownToCosenseText("# t\n\n## 大\n\n### 中\n\n#### 小\n\n本文")).toBe(
      "t\n[**** 大]\n[*** 中]\n[** 小]\n本文",
    )
  })

  it("2 つ目からの # の見出しは、いちばん大きい文字の装飾になる", () => {
    expect(markdownToCosenseText("# a\n\n# b")).toBe("a\n[***** b]")
  })

  it("見出しの前には空行を挟む", () => {
    expect(markdownToCosenseText("本文\n\n## 次")).toBe("\n本文\n\n[**** 次]")
  })
})

describe("箇条書き", () => {
  it("箇条書きは字下げになり、入れ子は深い字下げになる", () => {
    expect(markdownToCosenseText("- a\n  - b\n- c")).toBe("\n a\n  b\n c")
  })

  it("番号付きの箇条書きは、番号を残す", () => {
    expect(markdownToCosenseText("3. a\n4. b")).toBe("\n 3. a\n 4. b")
  })

  it("タスクの箇条書きは、チェックの印を残す", () => {
    expect(markdownToCosenseText("- [ ] a\n- [x] b")).toBe("\n ☐ a\n ☑ b")
  })

  it("項目の中のコードブロックは、項目と同じ深さに置く", () => {
    expect(markdownToCosenseText("- a\n\n  ```js\n  x\n  ```")).toBe("\n a\n code:js\n  x")
  })

  it("コードブロックの後の箇条書きは、コードの中身として読まれないよう空行で区切る", () => {
    expect(markdownToCosenseText("```\nx\n```\n\n- a")).toBe("\ncode:text\n x\n\n a")
  })

  it("表の後の箇条書きは、表の行として読まれないよう空行で区切る", () => {
    expect(markdownToCosenseText("| h |\n| - |\n\n- a")).toBe("\ntable:table\n h\n\n a")
  })

  it("項目の中のコードブロックの後に入れ子の箇条書きが来ても、空行で区切る", () => {
    expect(markdownToCosenseText("- ```js\n  x\n  ```\n  - b")).toBe("\n code:js\n  x\n\n  b")
  })

  it("番号付きの項目がコードブロックで始まるときは、番号だけの行を前に置く", () => {
    expect(markdownToCosenseText("1. ```js\n   x\n   ```")).toBe("\n 1.\n code:js\n  x")
  })
})

describe("インライン", () => {
  it("太字・斜体・打ち消し線は、文字の装飾になる", () => {
    expect(markdownToCosenseText("**a** *b* ~~c~~")).toBe("\n[* a] [/ b] [- c]")
  })

  it("ちょうど重なった装飾は、記号をまとめた 1 つの装飾になる", () => {
    expect(markdownToCosenseText("**_a_**")).toBe("\n[*/ a]")
  })

  it("装飾の中の装飾は、Cosense では入れ子にできないので外す", () => {
    expect(markdownToCosenseText("**a *b* c**")).toBe("\n[* a b c]")
  })

  it("装飾の中のリンクは残す", () => {
    expect(markdownToCosenseText("**[x](https://example.com)**")).toBe(
      "\n[* [x https://example.com]]",
    )
  })

  it("リンクは、ラベルと URL を並べた外部リンクになる", () => {
    expect(markdownToCosenseText("[例](https://example.com)")).toBe("\n[例 https://example.com]")
  })

  it("URL だけのリンクは、URL を括弧で囲む", () => {
    expect(markdownToCosenseText("<https://example.com>")).toBe("\n[https://example.com]")
  })

  it("文の中の URL も、URL を括弧で囲む", () => {
    expect(markdownToCosenseText("見て https://example.com")).toBe("\n見て [https://example.com]")
  })

  it("参照の形のリンクも、URL を引いてリンクにする", () => {
    expect(markdownToCosenseText("[a][1]\n\n[1]: https://example.com")).toBe(
      "\n[a https://example.com]",
    )
  })

  it("http でない URL へのリンクは、Cosense ではリンクにならないので文字だけを出す", () => {
    expect(markdownToCosenseText("[a](/x)")).toBe("\na")
  })

  it("画像は、画像の URL を括弧で囲む", () => {
    expect(markdownToCosenseText("![alt](https://example.com/a.png)")).toBe(
      "\n[https://example.com/a.png]",
    )
  })

  it("リンク付きの画像は、リンク先と画像の URL を並べる", () => {
    expect(markdownToCosenseText("[![](https://example.com/a.png)](https://example.com)")).toBe(
      "\n[https://example.com https://example.com/a.png]",
    )
  })

  it("インラインコードはインラインコードになる", () => {
    expect(markdownToCosenseText("`a*b`")).toBe("\n`a*b`")
  })

  it("$ で囲んだ数式は [$ ] になる", () => {
    expect(markdownToCosenseText("$x^2$")).toBe("\n[$ x^2]")
  })
})

describe("ブロック", () => {
  it("コードブロックは code: になり、中の空行も字下げを保つ", () => {
    expect(markdownToCosenseText("```js\nconst a = 1\n\nb\n```")).toBe(
      "\ncode:js\n const a = 1\n \n b",
    )
  })

  it("言語名の後にファイル名があれば、ファイル名を使う", () => {
    expect(markdownToCosenseText("```js a.js\nx\n```")).toBe("\ncode:a.js\n x")
  })

  it("言語名の無いコードブロックは code:text になる", () => {
    expect(markdownToCosenseText("```\nx\n```")).toBe("\ncode:text\n x")
  })

  it("4 つの空白で字下げした行は、コードブロックになる", () => {
    expect(markdownToCosenseText("    x")).toBe("\ncode:text\n x")
  })

  it("引用は > の行になる", () => {
    expect(markdownToCosenseText("> a\n> b")).toBe("\n> a\n> b")
  })

  it("$$ で囲んだブロックの数式は [$ ] になる", () => {
    expect(markdownToCosenseText("$$\nx_i\n$$")).toBe("\n[$ x_i]")
  })

  it("複数行のブロックの数式は、空白でつないだ 1 行の [$ ] になる", () => {
    expect(markdownToCosenseText("$$\na\nb\n$$")).toBe("\n[$ a b]")
  })

  it("表は table: になり、セルはタブで区切る", () => {
    expect(markdownToCosenseText("| a | b |\n| - | - |\n| 1 | 2 |")).toBe(
      "\ntable:table\n a\tb\n 1\t2",
    )
  })
})

describe("Markdown の記法を含まない文字列", () => {
  it("1 行だけの文は、そのまま本文の 1 行になる", () => {
    expect(markdownToCosenseText("ただの文")).toBe("\nただの文")
  })

  it("Markdown の記号として読まれない [ ] や # は、そのまま残って Cosense の記法として読まれる", () => {
    expect(markdownToCosenseText("[ページ] と #tag")).toBe("\n[ページ] と #tag")
  })

  it("HTML のタグは、そのまま文字として残る", () => {
    expect(markdownToCosenseText("<b>a</b>")).toBe("\n<b>a</b>")
  })
})

describe("書きかけや誤りのある Markdown", () => {
  it("閉じていない太字の記号は、記号のまま文字になる", () => {
    expect(markdownToCosenseText("**a")).toBe("\n**a")
  })

  it("閉じていないフェンスは、文書の終わりまでコードブロックになる", () => {
    expect(markdownToCosenseText("```js\na\nb")).toBe("\ncode:js\n a\n b")
  })

  it("区切りの行と列の数が合わない表は、表にならず文字のまま残る", () => {
    expect(markdownToCosenseText("| a | b |\n| - |")).toBe("\n| a | b |\n| - |")
  })

  it("バックスラッシュで逃がした記号は、記号の文字になる", () => {
    expect(markdownToCosenseText("\\*a\\*")).toBe("\n*a*")
  })
})

describe("parseFromMarkdown", () => {
  it("書き直した Cosense の記法のテキストを parse した AST を返す", () => {
    expect(parseFromMarkdown("**a**")).toEqual(parse("\n[* a]"))
  })

  it("position は、Markdown ではなく書き直したテキストの中の位置を指す", () => {
    expect(parseFromMarkdown("## 見出し").children[1]?.position.start).toEqual({
      line: 1,
      column: 0,
      offset: 1,
    })
  })

  it("parse と同じオプションを受け取り、そのとおりに読む", () => {
    expect(parseFromMarkdown("| **a** |\n| - |", { extensions: [tableCellNotation()] })).toEqual(
      parse("\ntable:table\n [* a]", { extensions: [tableCellNotation()] }),
    )
  })

  it("どんな文字列を渡しても、例外を投げずにページを返す", () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(..."*_~`$[]()!#>-|:\\ \n\t1.ax") }), (md) => {
        expect(parseFromMarkdown(md).type).toBe("page")
      }),
    )
  })
})
