import { parse } from "@cosense-toolbox/parser"
import { describe, expect, it } from "vitest"

import {
  type ComponentBlock,
  groupComponents,
  type GroupedBlock,
  parseClosingTag,
  parseComponentTag,
} from "./components"

describe("parseComponentTag", () => {
  it("/> で閉じたタグは自己完結のコンポーネントになる", () => {
    expect(parseComponentTag("<Counter />")).toEqual({
      name: "Counter",
      attributes: [],
      selfClosing: true,
    })
  })

  it("文字列・JSON・値なしの属性を読む", () => {
    expect(
      parseComponentTag(`<Chart title="売上" kind='bar' data={[1, 2]} opts={{"a": "}"}} wide />`),
    ).toEqual({
      name: "Chart",
      attributes: [
        { name: "title", value: "売上" },
        { name: "kind", value: "bar" },
        { name: "data", value: [1, 2] },
        { name: "opts", value: { a: "}" } },
        { name: "wide", value: true },
      ],
      selfClosing: true,
    })
  })

  it("/> で閉じないタグは children を取るコンポーネントになる", () => {
    expect(parseComponentTag('<Callout type="warn">')?.selfClosing).toBe(false)
  })

  it("小文字始まりの名前はコンポーネントにしない", () => {
    expect(parseComponentTag("<div />")).toBeNull()
  })

  it("JSON として読めない式はコンポーネントにしない", () => {
    expect(parseComponentTag("<Counter start={count + 1} />")).toBeNull()
  })

  it("行の途中にタグがあればコンポーネントにしない", () => {
    expect(parseComponentTag("ここに <Counter /> を置く")).toBeNull()
  })

  it("属性の間に空白が無ければコンポーネントにしない", () => {
    expect(parseComponentTag('<Counter a="1"b="2" />')).toBeNull()
  })

  it("閉じていない引用符があればコンポーネントにしない", () => {
    expect(parseComponentTag('<Counter a="1 />')).toBeNull()
  })
})

const group = (source: string) => groupComponents(parse(source).children, source)

const indents = (component: GroupedBlock | undefined) =>
  (component as ComponentBlock).children.map((block) => block.type === "line" && block.indent)

describe("parseClosingTag", () => {
  it("閉じタグの名前を返す", () => {
    expect(parseClosingTag("</Callout>")).toBe("Callout")
    expect(parseClosingTag("  </Callout >  ")).toBe("Callout")
  })

  it("閉じタグでなければ null", () => {
    expect(parseClosingTag("<Callout>")).toBeNull()
    expect(parseClosingTag("</callout>")).toBeNull()
    expect(parseClosingTag("</Callout> の後ろ")).toBeNull()
  })
})

describe("groupComponents", () => {
  it("開始タグから閉じタグまでの行を children に取る", () => {
    const [, callout, after] = group(
      'タイトル\n<Callout type="warn">\n注意\n 詳しく\n</Callout>\n後ろ',
    )
    expect(callout).toMatchObject({ type: "component", name: "Callout" })
    expect(indents(callout)).toEqual([0, 1])
    expect(after?.type).toBe("line")
  })

  it("インデントの深さでは children を決めない。閉じタグまでは浅い行も空行も含む", () => {
    const [, callout, after] = group("タイトル\n<Callout>\n 一段目\n\n二段落目\n</Callout>\n後ろ")
    expect((callout as ComponentBlock).children).toHaveLength(3)
    expect(after?.type).toBe("line")
  })

  it("開始タグの行が字下げされていれば、中の行をその深さぶん浅くする", () => {
    const [, callout] = group("タイトル\n <Callout>\n 中身\n  深い\n </Callout>")
    expect(indents(callout)).toEqual([0, 1])
  })

  it("自己完結のタグは後続行を取らない", () => {
    const [, counter, next] = group("タイトル\n<Counter />\n 次の行")
    expect((counter as ComponentBlock).children).toEqual([])
    expect(next?.type).toBe("line")
  })

  it("children の中のコンポーネントも入れ子にまとめる", () => {
    const [, outer] = group(
      'タイトル\n<Tabs>\n<Tab label="a">\n中身\n</Tab>\n<Tab label="b">\n中身\n</Tab>\n</Tabs>',
    )
    const tabs = (outer as ComponentBlock).children as ComponentBlock[]
    expect(tabs.map((tab) => [tab.name, tab.children.length])).toEqual([
      ["Tab", 1],
      ["Tab", 1],
    ])
  })

  it("閉じタグの無い開始タグはエラーになる", () => {
    expect(() => group("タイトル\n<Callout>\n中身")).toThrow(/<Callout> が閉じられていない.*2 行目/)
  })

  it("対応する開始タグの無い閉じタグはエラーになる", () => {
    expect(() => group("タイトル\n中身\n</Callout>")).toThrow(/<\/Callout>.*3 行目/)
  })

  it("入れ子の閉じる順番が違えばエラーになる", () => {
    expect(() => group("タイトル\n<A>\n<B>\n</A>\n</B>")).toThrow(/<\/A>/)
  })

  it("引用行と等幅行はコンポーネントにしない", () => {
    const blocks = group("タイトル\n><Counter />\n$ <Callout>")
    expect(blocks.map((block) => block.type)).toEqual(["title", "line", "line"])
  })
})
