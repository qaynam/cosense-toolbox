import { describe, expect, it } from "vitest"

import { allowedEntriesOf, declarationsToCheck } from "./files"

describe("declarationsToCheck", () => {
  it("型の宣言のファイルだけを見る", () => {
    expect(
      declarationsToCheck(
        ["index.mjs", "index.d.mts", "index.d.cts", "types.d.ts", "a.mjs.map"],
        [],
      ),
    ).toEqual(["index.d.mts", "index.d.cts", "types.d.ts"])
  })

  it("effect のまま使ってよいと決めた入口の宣言は見ない", () => {
    expect(
      declarationsToCheck(["index.d.mts", "schema.d.mts", "schema.d.cts"], ["schema"]),
    ).toEqual(["index.d.mts"])
  })

  it("入口の名前で始まるだけの別のファイルは見る", () => {
    expect(declarationsToCheck(["schema-helpers.d.mts"], ["schema"])).toEqual([
      "schema-helpers.d.mts",
    ])
  })

  it("サブディレクトリの中の宣言も見る", () => {
    expect(declarationsToCheck(["chunks/a.d.mts"], [])).toEqual(["chunks/a.d.mts"])
  })
})

describe("allowedEntriesOf", () => {
  it("--allow の後ろの名前を集める", () => {
    expect(allowedEntriesOf(["--allow", "schema", "--allow", "raw"])).toEqual(["schema", "raw"])
  })

  it("--allow が無ければ何も許さない", () => {
    expect(allowedEntriesOf([])).toEqual([])
  })
})
