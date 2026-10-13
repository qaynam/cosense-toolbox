import { describe, expect, it } from "vitest"

import { alignLines, computeChanges, createLineId } from "./changes"

/** `new0`, `new1`, … と順に id を作る。 */
const idSeq = (): (() => string) => {
  let n = 0
  return () => `new${n++}`
}

describe("computeChanges", () => {
  it("同じなら何も変えない", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]
    expect(computeChanges(base, ["A", "B"], idSeq())).toEqual([])
  })

  it("末尾に足した行は _end に入れる", () => {
    const base = [{ id: "a", text: "A" }]
    expect(computeChanges(base, ["A", "B"], idSeq())).toEqual([
      { _insert: "_end", lines: { id: "new0", text: "B" } },
    ])
  })

  it("先頭に足した行は、最初の行の前に入れる", () => {
    const base = [{ id: "a", text: "A" }]
    expect(computeChanges(base, ["X", "A"], idSeq())).toEqual([
      { _insert: "a", lines: { id: "new0", text: "X" } },
    ])
  })

  it("途中に足した行は、次に残る行の前に入れる", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]
    expect(computeChanges(base, ["A", "X", "B"], idSeq())).toEqual([
      { _insert: "b", lines: { id: "new0", text: "X" } },
    ])
  })

  it("消した行は _delete にする", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ]
    expect(computeChanges(base, ["A", "C"], idSeq())).toEqual([{ _delete: "b" }])
  })

  it("書き換えた行は、同じ id のまま _update にする", () => {
    const base = [{ id: "a", text: "A" }]
    expect(computeChanges(base, ["A2"], idSeq())).toEqual([{ _update: "a", lines: { text: "A2" } }])
  })

  it("書き換えと末尾への追加を、上から順に並べる", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ]
    expect(computeChanges(base, ["A", "X", "C", "D"], idSeq())).toEqual([
      { _update: "b", lines: { text: "X" } },
      { _insert: "_end", lines: { id: "new0", text: "D" } },
    ])
  })

  it("行が減った書き換えは、書き換えと残りの削除にする", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ]
    expect(computeChanges(base, ["A", "X", "D"], idSeq())).toEqual([
      { _update: "b", lines: { text: "X" } },
      { _delete: "c" },
    ])
  })

  it("行が増えた書き換えは、書き換えと、次に残る行の前への追加にする", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ]
    expect(computeChanges(base, ["A", "X", "Y", "C"], idSeq())).toEqual([
      { _update: "b", lines: { text: "X" } },
      { _insert: "c", lines: { id: "new0", text: "Y" } },
    ])
  })

  it("同じ長さの差分がいくつもあるときは、削除を先にする (入れ替えた 2 行は、前の行を消して末尾に足す)", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]
    expect(computeChanges(base, ["B", "A"], idSeq())).toEqual([
      { _delete: "a" },
      { _insert: "_end", lines: { id: "new0", text: "A" } },
    ])
  })

  it("元が空なら、すべての行を順に _end に入れる (新しいページ)", () => {
    expect(computeChanges([], ["Title", "line1", "line2"], idSeq())).toEqual([
      { _insert: "_end", lines: { id: "new0", text: "Title" } },
      { _insert: "_end", lines: { id: "new1", text: "line1" } },
      { _insert: "_end", lines: { id: "new2", text: "line2" } },
    ])
  })

  it("空にしたら、すべての行を消す", () => {
    const base = [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]
    expect(computeChanges(base, [], idSeq())).toEqual([{ _delete: "a" }, { _delete: "b" }])
  })

  it("どちらも空なら何も変えない", () => {
    expect(computeChanges([], [], idSeq())).toEqual([])
  })

  it("id を作る関数を渡さなければ、createLineId で作る", () => {
    expect(computeChanges([], ["Title"])).toEqual([
      { _insert: "_end", lines: { id: expect.stringMatching(/^[0-9a-f]{24}$/), text: "Title" } },
    ])
  })
})

describe("alignLines", () => {
  const base = [
    { id: "a", text: "A", updated: 100 },
    { id: "b", text: "B", updated: 200 },
    { id: "c", text: "C", updated: 300 },
  ]

  it("変えていなければ、どの行も元の同じ行に対応する", () => {
    expect(alignLines(base, ["A", "B", "C"]).map((line) => line?.id)).toEqual(["a", "b", "c"])
  })

  it("足した行は何にも対応せず、前後の行は元の行に対応したまま", () => {
    expect(alignLines(base, ["A", "new", "B", "C"]).map((line) => line?.id)).toEqual([
      "a",
      undefined,
      "b",
      "c",
    ])
  })

  it("書き換えた行は、元の行に対応しない (書いた人や日時が、もう今の文に当てはまらない)", () => {
    expect(alignLines(base, ["A", "B edited", "C"]).map((line) => line?.id)).toEqual([
      "a",
      undefined,
      "c",
    ])
  })

  it("行を消しても、残った行は元の行に対応したまま", () => {
    expect(alignLines(base, ["A", "C"]).map((line) => line?.id)).toEqual(["a", "c"])
  })

  it("id だけでなく、元の行をそのまま返す", () => {
    expect(alignLines(base, ["B"])[0]).toEqual({ id: "b", text: "B", updated: 200 })
  })

  it("元が空なら、どの行も何にも対応しない", () => {
    expect(alignLines([], ["A", "B"])).toEqual([undefined, undefined])
  })
})

describe("createLineId", () => {
  it("小文字の 16 進数 24 文字", () => {
    expect(createLineId()).toMatch(/^[0-9a-f]{24}$/)
  })

  it("呼ぶたびに違う id になる", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createLineId()))
    expect(ids.size).toBe(1000)
  })
})
