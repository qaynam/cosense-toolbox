import { describe, expect, it } from "vitest"

import { leaksOf } from "./leaks"

describe("leaksOf", () => {
  it("公開の型に effect の型が出ていれば、その行と名前を返す", () => {
    const dts = [
      'import { Option } from "effect";',
      "declare const linkAt: (text: string) => Option.Option<string>;",
    ].join("\n")

    expect(leaksOf(dts)).toEqual([{ line: 2, name: "Option" }])
  })

  it("import しただけで使っていない effect は、利用者に何も求めないので見逃す", () => {
    const dts = ['import { Option } from "effect";', "declare const a: string;"].join("\n")

    expect(leaksOf(dts)).toEqual([])
  })

  it("コメントの中の名前は型ではない", () => {
    const dts = [
      'import { Option } from "effect";',
      "/** Option があれば中身を返す */",
      "declare const a: string;",
    ].join("\n")

    expect(leaksOf(dts)).toEqual([])
  })

  it("別名で import した名前も見つける", () => {
    const dts = [
      'import { Effect as E } from "effect";',
      "declare const run: () => E.Effect<void>;",
    ].join("\n")

    expect(leaksOf(dts)).toEqual([{ line: 2, name: "E" }])
  })

  it("type を付けた import や effect のサブパスも見る", () => {
    const dts = [
      'import type { Schema } from "effect/Schema";',
      "declare const S: Schema<string>;",
    ].join("\n")

    expect(leaksOf(dts)).toEqual([{ line: 2, name: "Schema" }])
  })

  it('import("effect") で直に書かれた型も見つける', () => {
    const dts = 'declare const a: import("effect").Option.Option<string>;'

    expect(leaksOf(dts)).toEqual([{ line: 1, name: 'import("effect")' }])
  })

  it("名前の一部が同じなだけの別の識別子は見逃す", () => {
    const dts = ['import { Option } from "effect";', "declare const a: CompletionOptions;"].join(
      "\n",
    )

    expect(leaksOf(dts)).toEqual([])
  })
})
