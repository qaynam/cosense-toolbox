import { describe, expectTypeOf, it } from "vitest"

import type * as Effectful from "./effect"
import type * as Plain from "./index"

describe("2 つの入口", () => {
  it("Promise の入口と effect の入口の CosenseApi は、同じ名前のものを持つ", () => {
    expectTypeOf<keyof Plain.CosenseApi>().toEqualTypeOf<keyof Effectful.CosenseApi>()
  })

  it("Promise の入口と effect の入口の CosenseProjectApi は、同じ名前のものを持つ", () => {
    expectTypeOf<keyof Plain.CosenseProjectApi>().toEqualTypeOf<keyof Effectful.CosenseProjectApi>()
  })
})
