/**
 * 文法の仕様。記法ごとに、どこにどのスコープが付くかを書く。
 *
 * Language Server と同じ答えを返すかは parity.test.ts が広く確かめる。こちらは
 * 「何がどう読まれるか」を 1 テスト 1 つの振る舞いで書き、落ちたときにどの規則が
 * 壊れたかがテスト名で分かるようにする。
 */
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"
import minLight from "shiki/themes/min-light.mjs"
import { beforeAll, describe, expect, it } from "vitest"

import { cosense, cosenseX, SCOPES } from "./index"

let shiki: HighlighterCore

beforeAll(async () => {
  shiki = await createHighlighterCore({
    themes: [minLight],
    langs: [cosense, cosenseX],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  })
})

/**
 * `text` の中で最初に現れる `needle` に付くスコープ (文法のルートスコープは除く)。
 * `needle` の文字ごとにスコープが違えば、確かめたいものを切り出せていないので投げる。
 */
const scopesOf = (text: string, needle: string, lang = "cosense"): string[] => {
  const at = text.indexOf(needle)
  if (at < 0) throw new Error(`${JSON.stringify(needle)} is not in the text`)
  const line = text.slice(0, at).split("\n").length - 1
  const column = at - (text.lastIndexOf("\n", at - 1) + 1)

  const tokens = shiki.codeToTokensBase(text, {
    lang,
    theme: "min-light",
    includeExplanation: "scopeName",
  })[line]
  const perChar = (tokens ?? []).flatMap((token) =>
    (token.explanation ?? []).flatMap((part) =>
      Array.from(part.content, () =>
        // A scope given twice (a nested `{ }` inside another) looks the same as once.
        [...new Set(part.scopes.slice(1).map((scope) => scope.scopeName))].sort(),
      ),
    ),
  )

  const covered = perChar.slice(column, column + needle.length)
  const [first = []] = covered
  if (covered.some((scopes) => scopes.join(" ") !== first.join(" "))) {
    throw new Error(`${JSON.stringify(needle)} is not uniform: ${JSON.stringify(covered)}`)
  }
  return first
}

const IMAGE = "https://example.invalid/a.png"
const PAGE = "https://example.invalid/about"

describe("タイトル", () => {
  it("1 行目はタイトルになり、中の記法は読まない", () => {
    expect(scopesOf("はじめての[リンク]\n本文", "はじめての[リンク]")).toEqual([SCOPES.title])
  })

  it("2 行目以降はタイトルにならない", () => {
    expect(scopesOf("T\n本文", "本文")).toEqual([])
  })
})

describe("frontmatter", () => {
  const text = "---\ntitle: 投稿\n---\nはじめての投稿\n本文"

  it("先頭の --- で囲んだ行は frontmatter になる", () => {
    expect(scopesOf(text, "title: 投稿")).toEqual([SCOPES.frontmatter])
  })

  it("囲みの次の行がタイトルになる", () => {
    expect(scopesOf(text, "はじめての投稿")).toEqual([SCOPES.title])
  })

  it("タイトルの次の行は本文になる", () => {
    expect(scopesOf(text, "本文")).toEqual([])
  })
})

describe("ページへのリンク", () => {
  it("[ページ] はページへのリンクになる", () => {
    expect(scopesOf("T\n[ページ]", "[ページ]")).toEqual([SCOPES.link])
  })

  it("[/project/ページ] は別のプロジェクトへのリンクになる", () => {
    expect(scopesOf("T\n[/help-jp/ページ]", "[/help-jp/ページ]")).toEqual([SCOPES.projectLink])
  })

  it("中身が空白だけの [ ] はリンクにならない", () => {
    expect(scopesOf("T\n[ ]", "[ ]")).toEqual([])
  })

  it("閉じていない [ はリンクにならない", () => {
    expect(scopesOf("T\n[ページ", "[ページ")).toEqual([])
  })

  it("中に角括弧を含む外側はリンクにならず、内側がリンクになる", () => {
    const text = "T\n[a [b] c]"
    expect(scopesOf(text, "[a ")).toEqual([])
    expect(scopesOf(text, "[b]")).toEqual([SCOPES.link])
  })
})

describe("URL と画像", () => {
  it("角括弧の無い URL は外部リンクになる", () => {
    expect(scopesOf(`T\n${PAGE}`, PAGE)).toEqual([SCOPES.externalLink])
  })

  it("角括弧の無い画像 URL は、画像ではなく外部リンクになる", () => {
    expect(scopesOf(`T\n${IMAGE}`, IMAGE)).toEqual([SCOPES.externalLink])
  })

  it("[ラベル URL] は外部リンクになる", () => {
    expect(scopesOf(`T\n[ラベル ${PAGE}]`, `[ラベル ${PAGE}]`)).toEqual([SCOPES.externalLink])
  })

  it("[画像 URL] は画像になる", () => {
    expect(scopesOf(`T\n[${IMAGE}]`, `[${IMAGE}]`)).toEqual([SCOPES.image])
  })

  it("ラベルの付いた画像 URL は、画像ではなく外部リンクになる", () => {
    expect(scopesOf(`T\n[ラベル ${IMAGE}]`, `[ラベル ${IMAGE}]`)).toEqual([SCOPES.externalLink])
  })

  it("[URL 画像 URL] はリンク付きの画像になる", () => {
    expect(scopesOf(`T\n[${PAGE} ${IMAGE}]`, `[${PAGE} ${IMAGE}]`)).toEqual([SCOPES.image])
  })

  it("拡張子の無い Gyazo のページ URL も画像になる", () => {
    const gyazo = "[https://gyazo.com/0123456789abcdef0123456789abcdef]"
    expect(scopesOf(`T\n${gyazo}`, gyazo)).toEqual([SCOPES.image])
  })

  it("フラグメントが拡張子で終わる URL も画像になる", () => {
    const svg = "[https://example.invalid/api/badge?id=1#.svg]"
    expect(scopesOf(`T\n${svg}`, svg)).toEqual([SCOPES.image])
  })

  it("クエリの中にだけ拡張子のある URL は画像にならない", () => {
    const proxied = "[https://example.invalid/img?url=a.png]"
    expect(scopesOf(`T\n${proxied}`, proxied)).toEqual([SCOPES.externalLink])
  })

  it("URL でなくても、拡張子が画像なら [a.png] は画像になる", () => {
    expect(scopesOf("T\n[a.png]", "[a.png]")).toEqual([SCOPES.image])
  })
})

describe("動画・音声・埋め込み", () => {
  const VIDEO = "https://example.invalid/a.mp4"
  const SOUND = "https://example.invalid/a.mp3"
  const YOUTUBE = "https://www.youtube.com/watch?v=abc"

  it("[動画 URL] はメディアになる", () => {
    expect(scopesOf(`T\n[${VIDEO}]`, `[${VIDEO}]`)).toEqual([SCOPES.media])
  })

  it("[[動画 URL]] もメディアになる", () => {
    expect(scopesOf(`T\n[[${VIDEO}]]`, `[[${VIDEO}]]`)).toEqual([SCOPES.media])
  })

  it("クエリの付いた動画 URL は、単独ではメディアにならない", () => {
    expect(scopesOf(`T\n[${VIDEO}?t=1]`, `[${VIDEO}?t=1]`)).toEqual([SCOPES.externalLink])
  })

  it("[URL 動画 URL] はリンク付きの動画としてメディアになる", () => {
    expect(scopesOf(`T\n[${PAGE} ${VIDEO}]`, `[${PAGE} ${VIDEO}]`)).toEqual([SCOPES.media])
  })

  it("ラベルの付いた動画 URL は外部リンクになる", () => {
    expect(scopesOf(`T\n[動画 ${VIDEO}]`, `[動画 ${VIDEO}]`)).toEqual([SCOPES.externalLink])
  })

  it("ラベルの付いた音声 URL はメディアになる", () => {
    expect(scopesOf(`T\n[BGM ${SOUND}]`, `[BGM ${SOUND}]`)).toEqual([SCOPES.media])
    expect(scopesOf(`T\n[${SOUND} BGM]`, `[${SOUND} BGM]`)).toEqual([SCOPES.media])
  })

  it("音声 URL と画像 URL が並ぶと画像になる", () => {
    expect(scopesOf(`T\n[${SOUND} ${IMAGE}]`, `[${SOUND} ${IMAGE}]`)).toEqual([SCOPES.image])
  })

  it("[YouTube の URL] はメディアになる", () => {
    expect(scopesOf(`T\n[${YOUTUBE}]`, `[${YOUTUBE}]`)).toEqual([SCOPES.media])
  })

  it("[[YouTube の URL]] はメディアにならず、太字の中の外部リンクになる", () => {
    expect(scopesOf(`T\n[[${YOUTUBE}]]`, YOUTUBE)).toEqual([SCOPES.bold, SCOPES.externalLink])
  })
})

describe("アイコン", () => {
  it("[user.icon] はアイコンになる", () => {
    expect(scopesOf("T\n[user.icon]", "[user.icon]")).toEqual([SCOPES.icon])
  })

  it("[user.icon*3] のように数を付けてもアイコンになる", () => {
    expect(scopesOf("T\n[user.icon*3]", "[user.icon*3]")).toEqual([SCOPES.icon])
  })
})

describe("タグ", () => {
  it("行頭の #tag はタグになる", () => {
    expect(scopesOf("T\n#tag", "#tag")).toEqual([SCOPES.hashtag])
  })

  it("空白の後の #tag はタグになる", () => {
    expect(scopesOf("T\n本文 #tag", "#tag")).toEqual([SCOPES.hashtag])
  })

  it("全角スペースの後の #tag もタグになる", () => {
    expect(scopesOf("T\n本文\u3000#tag", "#tag")).toEqual([SCOPES.hashtag])
  })

  it("単語の途中の # はタグにならない", () => {
    expect(scopesOf("T\nC#言語", "#言語")).toEqual([])
  })

  it("タグは空白で終わる", () => {
    expect(scopesOf("T\n#tag 本文", "本文")).toEqual([])
  })
})

describe("インラインコード", () => {
  it("`code` はインラインコードになり、中の記法は読まない", () => {
    expect(scopesOf("T\n`[ページ]`", "`[ページ]`")).toEqual([SCOPES.code])
  })

  it("閉じていない ` はインラインコードにならない", () => {
    expect(scopesOf("T\n`code", "`code")).toEqual([])
  })
})

describe("コードブロック", () => {
  const text = "T\ncode:a.js\n const a = [b]\n  #deeper\n行"

  it("code: の行はコードブロックになる", () => {
    expect(scopesOf(text, "code:")).toContain(SCOPES.codeBlock)
  })

  it("code: より深く字下げした行は、中の記法を読まずにコードブロックになる", () => {
    expect(scopesOf(text, " const a = [b]")).toEqual([SCOPES.codeBlock])
    expect(scopesOf(text, "  #deeper")).toEqual([SCOPES.codeBlock])
  })

  it("字下げが code: の深さに戻るとコードブロックは終わる", () => {
    expect(scopesOf(text, "行")).toEqual([])
  })

  it("全角スペースの字下げも、コードブロックの字下げとして数える", () => {
    const fullWidth = "T\ncode:a.js\n\u3000x\n行"
    expect(scopesOf(fullWidth, "x")).toEqual([SCOPES.codeBlock])
    expect(scopesOf(fullWidth, "行")).toEqual([])
  })

  it("字下げした code: は、それより深い行だけを含む", () => {
    const nested = "T\n code:a.js\n  x\n [ページ]"
    expect(scopesOf(nested, "x")).toEqual([SCOPES.codeBlock])
    expect(scopesOf(nested, "[ページ]")).toEqual([SCOPES.link])
  })
})

describe("表", () => {
  const text = "T\ntable:t\n [a]\tb\n行"

  it("table: より深く字下げした行は、中の記法を読まずに表になる", () => {
    expect(scopesOf(text, "[a]")).toEqual([SCOPES.table])
  })

  it("字下げが table: の深さに戻ると表は終わる", () => {
    expect(scopesOf(text, "行")).toEqual([])
  })
})

describe("数式", () => {
  it("[$ x] は数式になる", () => {
    expect(scopesOf("T\n[$ x^2]", "[$ x^2]")).toEqual([SCOPES.formula])
  })

  it("数式の中の角括弧は数式の一部で、リンクにならない", () => {
    expect(scopesOf("T\n[$ [a] + 1]", " + 1]")).toEqual([SCOPES.formula])
  })
})

describe("文字の装飾", () => {
  it("[* x] は太字になる", () => {
    expect(scopesOf("T\n[* 太字]", "[* 太字]")).toEqual([SCOPES.bold])
  })

  it("[** x] は 1 段大きい太字になる", () => {
    expect(scopesOf("T\n[** 大]", "[** 大]")).toEqual([SCOPES.bold2])
  })

  it("[*** x] 以上はいちばん大きい太字になる", () => {
    expect(scopesOf("T\n[*** 特大]", "[*** 特大]")).toEqual([SCOPES.bold3])
    expect(scopesOf("T\n[***** 特大]", "[***** 特大]")).toEqual([SCOPES.bold3])
  })

  it("[/ x] は斜体、[- x] は打ち消し、[_ x] は下線になる", () => {
    expect(scopesOf("T\n[/ 斜体]", "[/ 斜体]")).toEqual([SCOPES.italic])
    expect(scopesOf("T\n[- 打ち消し]", "[- 打ち消し]")).toEqual([SCOPES.strike])
    expect(scopesOf("T\n[_ 下線]", "[_ 下線]")).toEqual([SCOPES.underline])
  })

  it("記号を重ねると、どれもが付く", () => {
    expect(scopesOf("T\n[-/** x]", "[-/** x]")).toEqual(
      [SCOPES.strike, SCOPES.italic, SCOPES.bold2].sort(),
    )
  })

  it("見た目の付かない Cosense の記号の [! x] は装飾で、リンクにも何にもならない", () => {
    expect(scopesOf("T\n[! 注意]", "[! 注意]")).toEqual([])
  })

  it("見た目の付く記号とほかの記号を混ぜると、見た目の付く記号のスコープだけが付く", () => {
    expect(scopesOf("T\n[*! 強い注意]", "[*! 強い注意]")).toEqual([SCOPES.bold])
  })

  it("見た目の付かない記号の装飾の中も、リンクを読む", () => {
    expect(scopesOf("T\n[! [ページ]です]", "[ページ]")).toEqual([SCOPES.link])
  })

  it("見た目の付かない記号の装飾も入れ子にならず、内側の [* x] はリンクになる", () => {
    expect(scopesOf("T\n[! [* x]です]", "[* x]")).toEqual([SCOPES.link])
  })

  it("= も見た目の付かない装飾の記号で、[= x] はリンクにならない", () => {
    expect(scopesOf("T\n[= x]", "[= x]")).toEqual([])
  })

  it("Cosense の記号でない @ で始まる括弧は、リンクになる", () => {
    expect(scopesOf("T\n[@ x]", "[@ x]")).toEqual([SCOPES.link])
  })

  it("記号の後に空白が無ければ装飾にならず、リンクになる", () => {
    expect(scopesOf("T\n[*太字]", "[*太字]")).toEqual([SCOPES.link])
  })

  it("装飾の中のリンクは、装飾とリンクの両方になる", () => {
    expect(scopesOf("T\n[* [ページ]]", "[ページ]")).toEqual([SCOPES.bold, SCOPES.link].sort())
  })

  it("装飾は入れ子にならず、内側の [_ x] はリンクになる", () => {
    expect(scopesOf("T\n[* [_ x]]", "[_ x]")).toEqual([SCOPES.bold, SCOPES.link].sort())
  })

  it("装飾の中の [a.png] は画像ではなく、リンクになる", () => {
    expect(scopesOf("T\n[* [a.png]]", "[a.png]")).toEqual([SCOPES.bold, SCOPES.link].sort())
  })

  it("装飾は、中の角括弧の深さを数えて閉じる", () => {
    expect(scopesOf("T\n[* a [] b]", " b]")).toEqual([SCOPES.bold])
  })

  it("閉じていない装飾は次の行に続かない", () => {
    expect(scopesOf("T\n[* a [b] c\n次の行", "次の行")).toEqual([])
  })
})

describe("インラインコードと括弧", () => {
  it("インラインコードが始まる括弧はリンクにならない (Cosense Web はコードを先に読む)", () => {
    expect(scopesOf("T\n[リンク `x` です]", "[リンク ")).toEqual([])
  })

  it("その括弧の中のインラインコードは、コードになる", () => {
    expect(scopesOf("T\n[リンク `x` です]", "`x`")).toEqual([SCOPES.code])
  })

  it("インラインコードが始まる括弧は装飾にならない", () => {
    expect(scopesOf("T\n[* 太字 `x` です]", "[* 太字 ")).toEqual([])
  })

  it("入れ子の括弧の後でインラインコードが始まっても、装飾にならない", () => {
    expect(scopesOf("T\n[* a [b] `c` d]", "[* a ")).toEqual([])
  })

  it("インラインコードが始まる [[ ]] は太字にならない", () => {
    expect(scopesOf("T\n[[a `b` c]]", "[[a ")).toEqual([])
  })

  it("インラインコードが始まる [$ ] は数式にならない", () => {
    expect(scopesOf("T\n[$ a``]", "[$ a")).toEqual([])
  })

  it("閉じないバッククォートは括弧を妨げない", () => {
    expect(scopesOf("T\n[a ` b]", "[a ` b]")).toEqual([SCOPES.link])
  })
})

describe("コマンドの行", () => {
  it("字下げの後が $ と空白の行は、全体がコードになり、中の記法は読まない", () => {
    expect(scopesOf("T\n  $ npm install [x] #tag", "$ npm install [x] #tag")).toEqual([SCOPES.code])
  })

  it("% と空白で始まる行もコマンドになる", () => {
    expect(scopesOf("T\n% ls", "% ls")).toEqual([SCOPES.code])
  })

  it("$ の後に空白が無ければコマンドにならない", () => {
    expect(scopesOf("T\n$[x]", "[x]")).toEqual([SCOPES.link])
  })
})

describe("[[ ]]", () => {
  it("[[x]] は太字になる", () => {
    expect(scopesOf("T\n[[強調]]", "[[強調]]")).toEqual([SCOPES.bold])
  })

  it("[[画像 URL]] は画像になる", () => {
    expect(scopesOf(`T\n[[${IMAGE}]]`, `[[${IMAGE}]]`)).toEqual([SCOPES.image])
  })

  it("最初の ]] で閉じる", () => {
    expect(scopesOf("T\n[[a]] b]]", " b]]")).toEqual([])
  })

  it("中のリンクは、太字とリンクの両方になる", () => {
    expect(scopesOf("T\n[[a [ページ] b]]", "[ページ]")).toEqual([SCOPES.bold, SCOPES.link].sort())
  })
})

describe("引用", () => {
  const text = "T\n> 引用 [ページ]\n行"

  it("> で始まる行は引用になり、記号に引用記号のスコープが付く", () => {
    expect(scopesOf(text, ">")).toEqual(["markup.quote.cosense", SCOPES.quote].sort())
  })

  it("引用の中の記法も読む", () => {
    expect(scopesOf(text, "[ページ]")).toEqual(["markup.quote.cosense", SCOPES.link].sort())
  })

  it("引用は行末で終わる", () => {
    expect(scopesOf(text, "行")).toEqual([])
  })
})

describe("コンポーネント (.csnx)", () => {
  const LINE = "meta.tag.component.cosense"
  const x = (text: string, needle: string) => scopesOf(text, needle, "cosense-x")

  it("大文字で始まるタグの名前はコンポーネントになる", () => {
    expect(x('T\n<Callout type="warn">', "Callout")).toEqual([LINE, SCOPES.component].sort())
  })

  it("閉じタグの名前もコンポーネントになる", () => {
    expect(x("T\n</Callout>", "Callout")).toEqual([LINE, SCOPES.component].sort())
  })

  it("属性の名前と、引用符で囲んだ値を読み分ける", () => {
    const text = "T\n<Callout type=\"warn\" title='注意'>"
    expect(x(text, "type")).toEqual([LINE, SCOPES.attribute].sort())
    expect(x(text, '"warn"')).toEqual([LINE, SCOPES.attributeValue].sort())
    expect(x(text, "'注意'")).toEqual([LINE, SCOPES.attributeValue].sort())
  })

  it("{ } で囲んだ値は式になり、中の数値は数値になる", () => {
    const text = "T\n<Counter start={10} />"
    expect(x(text, "{")).toContain(SCOPES.expression)
    expect(x(text, "10")).toEqual([LINE, SCOPES.expression, "constant.numeric.cosense"].sort())
  })

  it("式の中の { } は入れ子として数え、外側の } で式が終わる", () => {
    const text = 'T\n<Box style={{ a: 1 }} id="b">'
    expect(x(text, "}}")).toContain(SCOPES.expression)
    expect(x(text, '"b"')).toEqual([LINE, SCOPES.attributeValue].sort())
  })

  it("値の中の Cosense の記法は読まない", () => {
    expect(x('T\n<Note href="[ページ]">', "[ページ]")).toEqual([LINE, SCOPES.attributeValue].sort())
  })

  it("タグの後ろの文章は、記法を読まずにそのままにする", () => {
    expect(x("T\n<Callout> text [ページ] まで", " text [ページ] まで")).toEqual([LINE])
  })

  it("1 行目がタグなら、タイトルではなくコンポーネントになる", () => {
    expect(x('<Callout type="warn">\n 中身', "Callout")).toEqual([LINE, SCOPES.component].sort())
  })

  it("frontmatter の次の行がタグなら、タイトルではなくコンポーネントになる", () => {
    expect(x("---\na: 1\n---\n<Callout>\n 中身", "Callout")).toEqual(
      [LINE, SCOPES.component].sort(),
    )
  })

  it("小文字で始まるタグはコンポーネントにならない", () => {
    expect(x("T\n<div>", "<div>")).toEqual([])
  })

  it(".csn はコンポーネントを読まず、1 行目のタグもタイトルになる", () => {
    expect(scopesOf('T\n<Callout type="[ページ]">', "[ページ]")).toEqual([SCOPES.link])
    expect(scopesOf("<Callout>\n 中身", "<Callout>")).toEqual([SCOPES.title])
  })
})
