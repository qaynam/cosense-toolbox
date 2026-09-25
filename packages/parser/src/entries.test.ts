/**
 * サブパスの入口の仕様。何をどの入口から出すかは、利用者のバンドルに入るものを決めるので、
 * 公開 API の一部として固定しておく (CLAUDE.md §4)。
 */
import { describe, expect, it } from "vitest"

import pkg from "../package.json"
import config from "../tsdown.config"

/** `package.json` の exports のキーを、tsdown の entry 名に直す (`.` → index、`./html` → html)。 */
const entryNameOf = (subpath: string): string =>
  subpath === "." ? "index" : subpath.replace(/^\.\//, "")

describe("サブパスの入口", () => {
  it("package.json の exports と tsdown の entry は同じサブパスを持つ", () => {
    const exported = Object.keys(pkg.exports)
      .filter((subpath) => subpath !== "./package.json")
      .map(entryNameOf)
    const entry = Array.isArray(config) ? {} : (config.entry as Record<string, string>)
    expect(exported.sort()).toEqual(Object.keys(entry).sort())
  })

  it("./html は HTML 系の出力 (hast と HTML の文字列) と、描画の拡張を出す", async () => {
    expect(Object.keys(await import("./html")).sort()).toEqual(
      [
        "codeLanguageOf",
        "codeLineNumbers",
        "defaultClassNames",
        "defaultHastHandlers",
        "defaultPageUrl",
        "escapeHtml",
        "safeHref",
        "safeSrc",
        "tableCellLineBreaks",
        "toHast",
        "toHtml",
      ].sort(),
    )
  })

  it("./compile は出力の形式を問わない土台だけを出す", async () => {
    expect(Object.keys(await import("./compile")).sort()).toEqual(["createCompiler", "toPlainText"])
  })
})
