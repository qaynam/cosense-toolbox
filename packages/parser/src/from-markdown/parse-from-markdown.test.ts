import { describe, expect, it } from "vitest"

import { tableCellNotation } from "../extensions"
import { parse } from "../parse"
import { parseFromMarkdown } from "./parse-from-markdown"

/**
 * `markdown` を読んだ結果が、Cosense の記法で `cosense` と書いたページと同じ AST になる。
 * 1 行目はタイトルなので、Markdown が見出しで始まらないときの `cosense` は空行から始まる。
 */
const expectSamePage = (markdown: string, cosense: string) =>
  expect(parseFromMarkdown(markdown)).toEqual(parse(cosense))

describe("ページの構造", () => {
  it("先頭の # の見出しはタイトルになる", () => {
    expectSamePage("# タイトル\n\n本文", "タイトル\n本文")
  })

  it("見出しで始まらなければ、タイトルは空になる", () => {
    expectSamePage("本文", "\n本文")
  })

  it("空の Markdown は空のページになる", () => {
    expectSamePage("", "")
  })

  it("段落の中の改行は、そのまま行の区切りになる", () => {
    expectSamePage("a\nb", "\na\nb")
  })

  it("段落と段落の間は空行になる", () => {
    expectSamePage("a\n\nb", "\na\n\nb")
  })

  it("段落の後の箇条書きは、空行を挟まずに続く", () => {
    expectSamePage("前\n\n- a", "\n前\n a")
  })

  it("区切り線は、前後の段落の間の空行になる", () => {
    expectSamePage("a\n\n---\n\nb", "\na\n\nb")
  })
})

describe("見出し", () => {
  it("深い見出しほど小さい文字の装飾になり、見出しの後は空行を挟まない", () => {
    expectSamePage(
      "# t\n\n## 大\n\n### 中\n\n#### 小\n\n本文",
      "t\n[**** 大]\n[*** 中]\n[** 小]\n本文",
    )
  })

  it("2 つ目からの # の見出しは、いちばん大きい文字の装飾になる", () => {
    expectSamePage("# a\n\n# b", "a\n[***** b]")
  })

  it("見出しの前には空行を挟む", () => {
    expectSamePage("本文\n\n## 次", "\n本文\n\n[**** 次]")
  })
})

describe("箇条書き", () => {
  it("箇条書きは字下げになり、入れ子は深い字下げになる", () => {
    expectSamePage("- a\n  - b\n- c", "\n a\n  b\n c")
  })

  it("番号付きの箇条書きは、番号を残す", () => {
    expectSamePage("3. a\n4. b", "\n 3. a\n 4. b")
  })

  it("タスクの箇条書きは、チェックの印を残す", () => {
    expectSamePage("- [ ] a\n- [x] b", "\n ☐ a\n ☑ b")
  })

  it("項目の中のコードブロックは、項目と同じ深さに置く", () => {
    expectSamePage("- a\n\n  ```js\n  x\n  ```", "\n a\n code:js\n  x")
  })

  it("コードブロックと表の後の箇条書きは、その中身として読まれないよう空行で区切る", () => {
    expectSamePage("```\nx\n```\n\n- a", "\ncode:text\n x\n\n a")
    expectSamePage("| h |\n| - |\n\n- a", "\ntable:table\n h\n\n a")
  })

  it("項目の中のコードブロックの後に入れ子の箇条書きが来ても、空行で区切る", () => {
    expectSamePage("- ```js\n  x\n  ```\n  - b", "\n code:js\n  x\n\n  b")
  })

  it("番号付きの項目がコードブロックで始まるときは、番号だけの行を前に置く", () => {
    expectSamePage("1. ```js\n   x\n   ```", "\n 1.\n code:js\n  x")
  })
})

describe("インライン", () => {
  it("太字・斜体・打ち消し線は、文字の装飾になる", () => {
    expectSamePage("**a** *b* ~~c~~", "\n[* a] [/ b] [- c]")
  })

  it("ちょうど重なった装飾は、記号をまとめた 1 つの装飾になる", () => {
    expectSamePage("**_a_**", "\n[*/ a]")
  })

  it("装飾の中の装飾は、Cosense では入れ子にできないので外す", () => {
    expectSamePage("**a *b* c**", "\n[* a b c]")
  })

  it("装飾の中のリンクは残す", () => {
    expectSamePage("**[x](https://example.com)**", "\n[* [x https://example.com]]")
  })

  it("リンクは、ラベルと URL を並べた外部リンクになる", () => {
    expectSamePage("[例](https://example.com)", "\n[例 https://example.com]")
  })

  it("URL だけのリンクは、URL を括弧で囲む", () => {
    expectSamePage(
      "<https://example.com> https://example.org",
      "\n[https://example.com] [https://example.org]",
    )
  })

  it("参照の形のリンクも、URL を引いてリンクにする", () => {
    expectSamePage("[a][1]\n\n[1]: https://example.com", "\n[a https://example.com]")
  })

  it("http でない URL へのリンクは、Cosense ではリンクにならないので文字だけを出す", () => {
    expectSamePage("[a](/x) [b](#y)", "\na b")
  })

  it("画像は、画像の URL を括弧で囲む", () => {
    expectSamePage("![alt](https://example.com/a.png)", "\n[https://example.com/a.png]")
  })

  it("リンク付きの画像は、リンク先と画像の URL を並べる", () => {
    expectSamePage(
      "[![](https://example.com/a.png)](https://example.com)",
      "\n[https://example.com https://example.com/a.png]",
    )
  })

  it("インラインコードはインラインコードになる", () => {
    expectSamePage("`a*b`", "\n`a*b`")
  })

  it("数式は [$ ] になる", () => {
    expectSamePage("$x^2$\n\n$$\nx_i\n$$", "\n[$ x^2]\n\n[$ x_i]")
  })
})

describe("ブロック", () => {
  it("コードブロックは code: になり、中の空行も字下げを保つ", () => {
    expectSamePage("```js\nconst a = 1\n\nb\n```", "\ncode:js\n const a = 1\n \n b")
  })

  it("言語名の後にファイル名があれば、ファイル名を使う", () => {
    expectSamePage("```js a.js\nx\n```", "\ncode:a.js\n x")
  })

  it("言語名の無いコードブロックは code:text になる", () => {
    expectSamePage("```\nx\n```", "\ncode:text\n x")
  })

  it("引用は > の行になる", () => {
    expectSamePage("> a\n> b", "\n> a\n> b")
  })

  it("表は table: になり、セルはタブで区切る", () => {
    expectSamePage("| a | b |\n| - | - |\n| 1 | 2 |", "\ntable:table\n a\tb\n 1\t2")
  })
})

describe("オプション", () => {
  it("parse と同じオプションを受け取り、そのとおりに読む", () => {
    const options = { extensions: [tableCellNotation()] }
    expect(parseFromMarkdown("| **a** |\n| - |", options)).toEqual(
      parse("\ntable:table\n [* a]", options),
    )
  })
})
