import { describe, expect, it } from "vitest"

import { parse } from "../parse"
import { type MarkdownOptions, toMarkdown } from "./to-markdown"
import { toMdast } from "./to-mdast"

/**
 * タイトルの後に `body` を書いたページを Markdown にし、タイトルの見出しを外した残りを見る。
 * 1 行目は必ずタイトルになるので、仮のタイトル `t` を置いている。
 */
const body = (source: string, options?: MarkdownOptions): string =>
  toMarkdown(parse(`t\n${source}`), options).replace(/^# t\n\n/, "")

describe("ページの構造", () => {
  it("タイトルは見出し 1 になる", () => {
    expect(toMarkdown(parse("タイトル"))).toBe("# タイトル\n")
  })

  it("字下げの無い行が続くと、行の区切りを保った 1 つの段落になる", () => {
    expect(body("あ\nい")).toBe("あ\\\nい\n")
  })

  it("空行は段落の区切りになる", () => {
    expect(body("あ\n\nい")).toBe("あ\n\nい\n")
  })

  it("字下げした行は箇条書きになり、深さが入れ子になる", () => {
    expect(body(" a\n  b\n c")).toBe("- a\n  - b\n- c\n")
  })

  it("字下げが 2 段以上深くなっても、入れ子は 1 段ずつ深くなる", () => {
    expect(body(" a\n   b")).toBe("- a\n  - b\n")
  })

  it("箇条書きが深い字下げから始まっても、最初の行は 1 段目になる", () => {
    expect(body("   a\n b")).toBe("- a\n- b\n")
  })

  it("前の行より浅い行は、親ではなく同じ並びの項目になる", () => {
    expect(body("   a\n  b\n c")).toBe("- a\n- b\n- c\n")
  })

  it("引用の行が続くと 1 つの引用になる", () => {
    expect(body("> 引用\n> 続き")).toBe("> 引用\\\n> 続き\n")
  })

  it("コマンドの行はインラインコードになる", () => {
    expect(body("$ ls -a")).toBe("`$ ls -a`\n")
  })
})

describe("見出し", () => {
  it("行全体が大きい文字の装飾なら、大きいほど浅い見出しになる", () => {
    expect(body("[** 小]\n\n[*** 中]\n\n[**** 大]")).toBe("#### 小\n\n### 中\n\n## 大\n")
  })

  it("見出しはタイトルより深い", () => {
    expect(body("[***** 最大]")).toBe("## 最大\n")
  })

  it("[* ] は文字が大きくならないので、行全体でも太字のまま", () => {
    expect(body("[* 太字]")).toBe("**太字**\n")
  })

  it("文の中の大きい文字の装飾は太字になる", () => {
    expect(body("前[*** 見出し]")).toBe("前**見出し**\n")
  })

  it("字下げした行の大きい文字の装飾は、箇条書きの中の太字になる", () => {
    expect(body(" [*** 見出し]")).toBe("- **見出し**\n")
  })

  it("headingDepth で見出しの深さを決められ、null なら太字にする", () => {
    expect(body("[*** 中]", { headingDepth: () => null })).toBe("**中**\n")
    expect(body("[*** 中]", { headingDepth: (sizeLevel) => sizeLevel })).toBe("## 中\n")
  })
})

describe("インライン記法", () => {
  it("斜体と打ち消しは強調と打ち消し線になる", () => {
    expect(body("[/ 斜体][- 消]")).toBe("*斜体*~~消~~\n")
  })

  it("Markdown に無い下線は、中身だけを出す", () => {
    expect(body("[_ 下線]")).toBe("下線\n")
  })

  it("内部リンクとハッシュタグはページへのリンクになる", () => {
    expect(body("[ページ] #tag")).toBe("[ページ](/%E3%83%9A%E3%83%BC%E3%82%B8) [#tag](/tag)\n")
  })

  it("pageUrl でページへのリンク先を決められる", () => {
    expect(body("[a]", { pageUrl: (title) => `https://scrapbox.io/p/${title}` })).toBe(
      "[a](https://scrapbox.io/p/a)\n",
    )
  })

  it("pageUrl が script の動く URL を返したら、リンクにせず文字だけを出す", () => {
    expect(body("[a]", { pageUrl: () => "javascript:alert(1)" })).toBe("a\n")
  })

  it("別のプロジェクトのページへのリンクも pageUrl を通る", () => {
    expect(body("[/proj/page]")).toBe("[/proj/page](/proj/page)\n")
  })

  it("外部リンクは、ラベルがあればそのラベルのリンクになる", () => {
    expect(body("[例 https://example.com]")).toBe("[例](https://example.com)\n")
  })

  it("ラベルの無い外部リンクは URL そのものになる", () => {
    expect(body("https://example.com")).toBe("<https://example.com>\n")
  })

  it("インラインコードはインラインコードになる", () => {
    expect(body("`a*b`")).toBe("`a*b`\n")
  })

  it("数式は $ で囲む", () => {
    expect(body("[$ x^2_i]")).toBe("$x^2_i$\n")
  })

  it("Markdown の記号として読まれる文字はエスケープする", () => {
    expect(body("*a* [b]x")).toBe("\\*a\\* [b](/b)x\n")
  })
})

describe("画像と埋め込み", () => {
  it("画像は画像になる", () => {
    expect(body("[https://example.com/a.png]")).toBe("![](https://example.com/a.png)\n")
  })

  it("Gyazo のページの URL は画像そのものの URL にする", () => {
    expect(body("[https://gyazo.com/0123456789abcdef0123456789abcdef]")).toBe(
      "![](https://i.gyazo.com/0123456789abcdef0123456789abcdef.png)\n",
    )
  })

  it("リンク付きの画像は、画像をリンクで包む", () => {
    expect(body("[https://example.com https://example.com/a.png]")).toBe(
      "[![](https://example.com/a.png)](https://example.com)\n",
    )
  })

  it("アイコンは、画像の URL が無ければユーザーのページへのリンクになる", () => {
    expect(body("[user.icon]")).toBe("[user](/user)\n")
  })

  it("iconImageUrl があれば、アイコンはリンクで包んだ画像になり、連打の数だけ並ぶ", () => {
    expect(body("[user.icon*2]", { iconImageUrl: ({ user }) => `https://i.example/${user}` })).toBe(
      "[![user](https://i.example/user)](/user)[![user](https://i.example/user)](/user)\n",
    )
  })

  it("動画は動画の URL へのリンクになる", () => {
    expect(body("[https://example.com/a.mp4]")).toBe("<https://example.com/a.mp4>\n")
  })

  it("埋め込みは書かれた URL へのリンクになる", () => {
    expect(body("[https://www.youtube.com/watch?v=abc]")).toBe(
      "<https://www.youtube.com/watch?v=abc>\n",
    )
  })

  it("地図はラベルのリンクになる", () => {
    expect(body("[東京駅 N35.68,E139.76]")).toBe(
      "[東京駅](https://www.google.com/maps/search/%E6%9D%B1%E4%BA%AC%E9%A7%85/@35.68,139.76,15z)\n",
    )
  })
})

describe("コードブロックと表", () => {
  it("コードブロックは、ファイル名から決めた言語名とファイル名の付いたフェンスになる", () => {
    expect(body("code:a.js\n const a = 1\n  return")).toBe(
      "```js a.js\nconst a = 1\n return\n```\n",
    )
  })

  it("言語名だけのコードブロックは、言語名だけのフェンスになる", () => {
    expect(body("code:python\n print(1)")).toBe("```python\nprint(1)\n```\n")
  })

  it("字下げしたコードブロックは箇条書きの中に入る", () => {
    expect(body(" a\n code:a.js\n  x")).toBe("- a\n- ```js a.js\n  x\n  ```\n")
  })

  it("表は 1 行目を見出しの行にした表になり、名前はその前に出す", () => {
    expect(body("table:表\n a\tb\n 1\t2")).toBe("表\n\n| a | b |\n| - | - |\n| 1 | 2 |\n")
  })

  it("セルの数が行ごとに違っても、表の形を保つ", () => {
    expect(body("table:表\n a\tb\n 1")).toBe("表\n\n| a | b |\n| - | - |\n| 1 |   |\n")
  })
})

describe("toMdast", () => {
  it("mdast の木を返す", () => {
    expect(toMdast(parse("t\n[*** 中]"))).toEqual({
      type: "root",
      children: [
        { type: "heading", depth: 1, children: [{ type: "text", value: "t" }] },
        { type: "heading", depth: 3, children: [{ type: "text", value: "中" }] },
      ],
    })
  })
})
