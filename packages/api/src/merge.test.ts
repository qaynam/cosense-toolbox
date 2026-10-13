import { describe, expect, it } from "vitest"

import type { BaseLine } from "./changes"
import { mergeThreeWay } from "./merge"

const lines = (...texts: string[]): BaseLine[] =>
  texts.map((text, i) => ({ id: `l${i + 1}`, text }))

/** `lines` と同じ id のまま、1 行だけ文を変える。 */
const withText = (base: readonly BaseLine[], at: number, text: string): BaseLine[] =>
  base.map((line, i) => (i === at ? { ...line, text } : line))

const BASE = lines("title", "alpha", "beta", "gamma")
const BASE_TEXTS = ["title", "alpha", "beta", "gamma"]

describe("mergeThreeWay", () => {
  it("どちらも変えていなければ、そのまま", () => {
    expect(mergeThreeWay(BASE, BASE_TEXTS, BASE)).toEqual({ merged: BASE_TEXTS, conflicts: [] })
  })

  it("ほかの人だけが変えた行は、ほかの人の文にする", () => {
    expect(mergeThreeWay(BASE, BASE_TEXTS, withText(BASE, 2, "BETA"))).toEqual({
      merged: ["title", "alpha", "BETA", "gamma"],
      conflicts: [],
    })
  })

  it("自分だけが変えた行は、自分の文にする", () => {
    expect(mergeThreeWay(BASE, ["title", "ALPHA", "beta", "gamma"], BASE)).toEqual({
      merged: ["title", "ALPHA", "beta", "gamma"],
      conflicts: [],
    })
  })

  it("違う行の変更は、両方とも入れる", () => {
    expect(
      mergeThreeWay(BASE, ["title", "ALPHA", "beta", "gamma"], withText(BASE, 3, "GAMMA")),
    ).toEqual({ merged: ["title", "ALPHA", "beta", "GAMMA"], conflicts: [] })
  })

  it("同じ行を同じ文に変えたのは、コンフリクトにしない", () => {
    expect(
      mergeThreeWay(BASE, ["title", "ALPHA", "beta", "gamma"], withText(BASE, 1, "ALPHA")),
    ).toEqual({ merged: ["title", "ALPHA", "beta", "gamma"], conflicts: [] })
  })

  it("同じ行を違う文に変えたら、自分の文を残してコンフリクトとして知らせる", () => {
    expect(
      mergeThreeWay(BASE, ["title", "ours", "beta", "gamma"], withText(BASE, 1, "theirs")),
    ).toEqual({
      merged: ["title", "ours", "beta", "gamma"],
      conflicts: [{ line: 1, ours: "ours", theirs: "theirs", base: "alpha" }],
    })
  })

  it("ほかの人が足した行は、その位置に入れる", () => {
    const theirs = [...BASE.slice(0, 2), { id: "r1", text: "new remote" }, ...BASE.slice(2)]
    expect(mergeThreeWay(BASE, BASE_TEXTS, theirs).merged).toEqual([
      "title",
      "alpha",
      "new remote",
      "beta",
      "gamma",
    ])
  })

  it("自分が足した行は、ほかの人が別の場所に足しても残る", () => {
    const theirs = [...BASE, { id: "r1", text: "remote tail" }]
    expect(mergeThreeWay(BASE, ["title", "alpha", "mine", "beta", "gamma"], theirs).merged).toEqual(
      ["title", "alpha", "mine", "beta", "gamma", "remote tail"],
    )
  })

  // 書いたのに応答を受け取れず、もう一度書くと、こうなる。サーバーにはもう同じ行がある。
  it("同じ場所に同じ行を両方が足したら、1 回だけ入れる", () => {
    const theirs = [...BASE, { id: "r1", text: "tail" }, { id: "r2", text: "tail 2" }]
    expect(mergeThreeWay(BASE, [...BASE_TEXTS, "tail", "tail 2"], theirs).merged).toEqual([
      ...BASE_TEXTS,
      "tail",
      "tail 2",
    ])
  })

  it("自分が足した行のうち、ほかの人が足した行と違う分は残す", () => {
    const theirs = [...BASE.slice(0, 2), { id: "r1", text: "same" }, ...BASE.slice(2)]
    expect(
      mergeThreeWay(BASE, ["title", "alpha", "same", "mine", "beta", "gamma"], theirs).merged,
    ).toEqual(["title", "alpha", "same", "mine", "beta", "gamma"])
  })

  it("ほかの人が消した行は、自分が触っていなければ消す", () => {
    expect(
      mergeThreeWay(
        BASE,
        BASE_TEXTS,
        BASE.filter((line) => line.id !== "l3"),
      ),
    ).toEqual({ merged: ["title", "alpha", "gamma"], conflicts: [] })
  })

  it("自分が消した行は、ほかの人が触っていなければ消す", () => {
    expect(mergeThreeWay(BASE, ["title", "alpha", "gamma"], BASE)).toEqual({
      merged: ["title", "alpha", "gamma"],
      conflicts: [],
    })
  })

  it("自分が書き換えた行をほかの人が消していたら、自分の文を残してコンフリクトとして知らせる", () => {
    const theirs = BASE.filter((line) => line.id !== "l2")
    expect(mergeThreeWay(BASE, ["title", "my edit", "beta", "gamma"], theirs)).toEqual({
      merged: ["title", "my edit", "beta", "gamma"],
      conflicts: [{ line: 1, ours: "my edit", theirs: null, base: "alpha" }],
    })
  })

  it("自分が消した行をほかの人が書き換えていたら、ほかの人の文を残してコンフリクトとして知らせる", () => {
    expect(mergeThreeWay(BASE, ["title", "beta", "gamma"], withText(BASE, 1, "theirs"))).toEqual({
      merged: ["title", "theirs", "beta", "gamma"],
      conflicts: [{ line: 1, ours: null, theirs: "theirs", base: "alpha" }],
    })
  })

  it("ほかの人が行を並べ替えたら、自分が書き換えた行もそれについていく", () => {
    const theirs = [BASE[0], BASE[3], BASE[1], BASE[2]] as BaseLine[]
    expect(mergeThreeWay(BASE, ["title", "ALPHA", "beta", "gamma"], theirs).merged).toEqual([
      "title",
      "gamma",
      "ALPHA",
      "beta",
    ])
  })

  it("元が空なら、自分の行だけになる", () => {
    expect(mergeThreeWay([], ["title", "body"], [])).toEqual({
      merged: ["title", "body"],
      conflicts: [],
    })
  })

  it("自分が何も変えていなければ、ほかの人のページをそのまま使う", () => {
    expect(mergeThreeWay(BASE, BASE_TEXTS, lines("title", "different", "now"))).toEqual({
      merged: ["title", "different", "now"],
      conflicts: [],
    })
  })
})

describe("mergeThreeWay は、自分が書いた文を落とさない", () => {
  const ours = ["title", "x", "beta", "gamma"]

  it.each([
    { name: "ほかの人が何もしていない", ours, theirs: BASE },
    { name: "ほかの人が同じ行を書き換えた", ours, theirs: withText(BASE, 1, "T") },
    { name: "ほかの人がその行を消した", ours, theirs: BASE.filter((line) => line.id !== "l2") },
    { name: "ほかの人が全部消した", ours, theirs: [] },
    { name: "ほかの人が全部書き換えた", ours, theirs: lines("a", "b") },
    {
      name: "ほかの人が並べ替えた",
      ours,
      theirs: [BASE[3], BASE[0], BASE[1], BASE[2]] as BaseLine[],
    },
    {
      name: "自分が足した行の次の行を、ほかの人が消した",
      ours: ["title", "alpha", "x", "beta", "gamma"],
      theirs: BASE.filter((line) => line.id !== "l3"),
    },
    {
      name: "自分が一番上に足し、ほかの人がタイトルを変えた",
      ours: ["x", "title", "alpha", "beta", "gamma"],
      theirs: withText(BASE, 0, "retitled"),
    },
  ])("$name", ({ ours, theirs }) => {
    expect(mergeThreeWay(BASE, ours, theirs).merged).toContain("x")
  })
})
