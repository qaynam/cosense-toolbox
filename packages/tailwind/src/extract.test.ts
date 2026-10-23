import { describe, expect, it } from "vitest"

import { extractStyles } from "./extract"

/** 抜き出したルールのセレクタを、出てきた順に並べる。 */
const order = (css: string): string[] =>
  extractStyles(css).rules.map(({ selector }) => selector.body + selector.pseudo)

describe("extractStyles", () => {
  it("ルールは元の詳細度の低い順に並べる。同じ詳細度なら書いた順", () => {
    const css = `
      .csn-page .a.b { color: red }
      .csn-page .c { color: red }
      .csn-page .d { color: red }
      .csn-page .e .f { color: red }
    `
    expect(order(css)).toEqual([".c", ".d", ".a.b", ".e .f"])
  })

  it("セレクタを並べたルールは、セレクタごとの詳細度で別々に並べる", () => {
    const css = `
      .csn-page .a.b, .csn-page .c { color: red }
      .csn-page .d { padding: 0 }
    `
    expect(order(css)).toEqual([".c", ".d", ".a.b"])
    expect(extractStyles(css).rules[0]?.declarations).toEqual({ color: "red" })
  })

  it("要素名・擬似要素・擬似クラス・属性・:has() / :not() の中身を詳細度に数える", () => {
    const css = `
      .csn-page .csn-line.csn-code-block > code { color: red }
      .csn-page .csn-line[data-indent]::before { color: red }
      .csn-page .csn-line:has(> .csn-indent-mark)::before { color: red }
      .csn-page .csn-line.csn-code-block:not(:has(> .csn-code-start))::before { color: red }
      .csn-page .csn-table td:nth-child(odd) { color: red }
      .csn-page .x:where(.y .z) { color: red }
    `
    // .csn-page を含めた詳細度は、.x:where() が (0,2,0)、:not(:has())::before が (0,4,1)、
    // 残りの 4 つがどれも (0,3,1)。同じ詳細度のものは書いた順のまま。
    expect(order(css)).toEqual([
      ".x:where(.y .z)",
      ".csn-line.csn-code-block > code",
      ".csn-line[data-indent]::before",
      ".csn-line:has(> .csn-indent-mark)::before",
      ".csn-table td:nth-child(odd)",
      ".csn-line.csn-code-block:not(:has(> .csn-code-start))::before",
    ])
  })

  it("同じセレクタのルールが 2 つあっても、両方を書いた順に残す", () => {
    const css = `
      .csn-page .a { color: red }
      .csn-page .a { padding: 0 }
    `
    expect(extractStyles(css).rules.map(({ declarations }) => declarations)).toEqual([
      { color: "red" },
      { padding: "0" },
    ])
  })

  it(".csn-page の子孫でないセレクタや、トップレベルの at-rule はエラーにする", () => {
    expect(() => extractStyles(".other .a { color: red }")).toThrow(/\.csn-page の下にない/)
    expect(() => extractStyles(".csn-page > .a { color: red }")).toThrow(/子孫/)
    expect(() => extractStyles("@media print { .csn-page .a { color: red } }")).toThrow(/media/)
  })
})
