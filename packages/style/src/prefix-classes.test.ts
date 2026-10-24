import { describe, expect, it } from "vitest"

import { prefixClasses } from "./prefix-classes"

describe("prefixClasses", () => {
  it("セレクタの class 名すべての前に接頭辞を付ける", () => {
    expect(prefixClasses(".page .line > .code-body {}", "csn-")).toBe(
      ".csn-page .csn-line > .csn-code-body {}",
    )
  })

  it("擬似クラスの引数の中の class 名にも付ける", () => {
    expect(prefixClasses(".page .line:has(> .indent-mark)::before {}", "csn-")).toBe(
      ".csn-page .csn-line:has(> .csn-indent-mark)::before {}",
    )
  })

  it("宣言の値とコメントには触れない", () => {
    expect(prefixClasses("/* .line */\n.page { margin: 0.5em }", "csn-")).toBe(
      "/* .line */\n.csn-page { margin: 0.5em }",
    )
  })

  it("要素名と属性セレクタには付けない", () => {
    expect(prefixClasses('.page td[data-provider="spotify"] {}', "csn-")).toBe(
      '.csn-page td[data-provider="spotify"] {}',
    )
  })

  it("装飾の記号ごとの deco- には付けない (toHtml の classPrefix と同じ)", () => {
    expect(prefixClasses(".page .deco.deco-\\| {}", "csn-")).toBe(".csn-page .csn-deco.deco-\\| {}")
  })
})
