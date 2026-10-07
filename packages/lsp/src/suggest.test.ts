import { describe, expect, it } from "vitest"

import {
  buildCandidateIndex,
  type Candidate,
  iconKeys,
  mergeVectorPages,
  rankCandidates,
  type TitleEntryLike,
} from "./suggest"

const titlesOf = (candidates: ReadonlyArray<Candidate>) => candidates.map((c) => c.title)

describe("buildCandidateIndex", () => {
  it("candidate set is page titles ∪ outgoing link targets", () => {
    const titles: TitleEntryLike[] = [
      { title: "Alpha", links: ["Beta", "Gamma"] },
      { title: "Beta", links: [] },
    ]
    const { byKey, sorted } = buildCandidateIndex(titles)
    expect(byKey.get("alpha")?.exists).toBe(true)
    expect(byKey.get("beta")?.exists).toBe(true)
    expect(byKey.get("gamma")?.exists).toBe(false)
    expect(sorted).toHaveLength(3)
  })

  it("a link target sharing a page key is the page, with its casing", () => {
    const { byKey } = buildCandidateIndex([
      { title: "CamelCase Page" },
      { title: "Other", links: ["camelcase_page"] },
    ])
    expect(byKey.get("camelcase_page")?.title).toBe("CamelCase Page")
    expect(byKey.get("camelcase_page")?.exists).toBe(true)
  })

  it("shorter titles first, and the most recently updated among the same length", () => {
    const { sorted } = buildCandidateIndex([
      { title: "abcdef", updated: 300 },
      { title: "abc", updated: 100 },
      { title: "xyz", updated: 200 },
    ])
    expect(titlesOf(sorted)).toEqual(["xyz", "abc", "abcdef"])
  })

  it("a run of digits and a trailing suffix count as one character, as on the web", () => {
    const { byKey } = buildCandidateIndex([
      { title: "日記 2024-10-03" },
      { title: "日記 7" },
      { title: "メモ-a" },
    ])
    expect(byKey.get("日記_2024-10-03")?.sortLength).toBe(byKey.get("日記_7")?.sortLength)
    expect(byKey.get("メモ-a")?.sortLength).toBe("メモ_".length)
  })

  it("a link target remembers the page linking to it only while there is one", () => {
    const { byKey } = buildCandidateIndex([
      { title: "A", links: ["Only A", "Both"] },
      { title: "B", links: ["Both"] },
    ])
    expect(byKey.get("only_a")?.soleLinker).toBe("A")
    expect(byKey.get("both")?.soleLinker).toBeUndefined()
  })

  it("a page linking to a title twice is still its one linker", () => {
    const { byKey } = buildCandidateIndex([{ title: "A", links: ["Idea", "idea"] }])
    expect(byKey.get("idea")?.soleLinker).toBe("A")
  })

  it("pages whose titles are one key are one candidate: the first given", () => {
    const { byKey, sorted } = buildCandidateIndex([
      { title: "Design Notes", updated: 1 },
      { title: "design_notes", updated: 2 },
    ])
    expect(sorted).toHaveLength(1)
    expect(byKey.get("design_notes")?.title).toBe("Design Notes")
  })
})

describe("rankCandidates — matching", () => {
  const index = buildCandidateIndex([
    { title: "Side Kanban:メモ", updated: 900 },
    { title: "Side Kanban", updated: 100 },
    { title: "side dish", updated: 50 },
    { title: "sidebar", updated: 10 },
    { title: "仕事", updated: 10 },
    { title: "人事", updated: 10 },
  ])

  it("a short title beats a recently updated long one", () => {
    expect(titlesOf(rankCandidates(index, "side"))).toEqual([
      "sidebar",
      "side dish",
      "Side Kanban",
      "Side Kanban:メモ",
    ])
  })

  it("every word has to appear, in any order", () => {
    expect(titlesOf(rankCandidates(index, "kan side"))).toEqual(["Side Kanban", "Side Kanban:メモ"])
  })

  it("spacing in the title never decides", () => {
    expect(titlesOf(rankCandidates(index, "sidekan"))).toEqual(["Side Kanban", "Side Kanban:メモ"])
  })

  it("a two-character query never falls back to fuzzy matching", () => {
    // One typo from a two-character query is nearly every two-character title.
    expect(rankCandidates(index, "議事")).toEqual([])
  })

  it("with few literal matches, titles one typo away anywhere in them follow", () => {
    expect(titlesOf(rankCandidates(index, "kanbna"))).toEqual(["Side Kanban", "Side Kanban:メモ"])
  })

  it("the fuzzy scan is skipped while literal matches are plentiful", () => {
    const many = buildCandidateIndex([
      ...Array.from({ length: 11 }, (_, i) => ({ title: `report ${i}` })),
      { title: "rport" },
    ])
    expect(titlesOf(rankCandidates(many, "report"))).not.toContain("rport")
  })

  it("an empty query is the whole index in its order", () => {
    expect(titlesOf(rankCandidates(index, ""))).toEqual(titlesOf(index.sorted))
  })

  it("caps results at 50", () => {
    const many = buildCandidateIndex(Array.from({ length: 80 }, (_, i) => ({ title: `item${i}` })))
    expect(rankCandidates(many, "item")).toHaveLength(50)
  })
})

describe("rankCandidates — what is offered", () => {
  it("neither the page being edited nor the exact title already typed", () => {
    const index = buildCandidateIndex([{ title: "memo" }, { title: "memo 2" }, { title: "here" }])
    expect(titlesOf(rankCandidates(index, "memo", { pageTitle: "here" }))).toEqual(["memo 2"])
    expect(titlesOf(rankCandidates(index, "her", { pageTitle: "here" }))).toEqual([])
  })

  it("a page with an icon stays, so it can still become an icon", () => {
    const index = buildCandidateIndex([{ title: "taro", image: "https://example.com/t.png" }])
    expect(titlesOf(rankCandidates(index, "taro"))).toEqual(["taro"])
  })

  it("a link target only the page being edited links to is not offered", () => {
    const index = buildCandidateIndex([
      { title: "here", links: ["idea", "shared"] },
      { title: "other", links: ["shared"] },
    ])
    expect(titlesOf(rankCandidates(index, "", { pageTitle: "here" }))).toEqual(["other", "shared"])
  })

  it("the icons the page already uses lead among the pages drawn with one", () => {
    const index = buildCandidateIndex([
      { title: "ta" },
      { title: "taro", image: "https://example.com/t.png" },
    ])
    expect(titlesOf(rankCandidates(index, "t", { icons: new Set(["taro"]) }))).toEqual([
      "taro",
      "ta",
    ])
  })
})

describe("rankCandidates — tags", () => {
  const index = buildCandidateIndex([
    { title: "Side Kanban" },
    { title: "C#入門" },
    { title: "side_kanban_board" },
  ])

  it("`_` separates the words of a tag query", () => {
    expect(titlesOf(rankCandidates(index, "kanban_side", { tagsOnly: true }))).toEqual([
      "Side Kanban",
      "side_kanban_board",
    ])
  })

  it("a title no tag can name is dropped, and so is the tag already typed", () => {
    expect(titlesOf(rankCandidates(index, "", { tagsOnly: true }))).toEqual([
      "Side Kanban",
      "side_kanban_board",
    ])
    expect(titlesOf(rankCandidates(index, "Side_Kanban", { tagsOnly: true }))).toEqual([
      "side_kanban_board",
    ])
  })
})

describe("mergeVectorPages", () => {
  const local = buildCandidateIndex(Array.from({ length: 8 }, (_, i) => ({ title: `local ${i}` })))
  const index = buildCandidateIndex([
    ...Array.from({ length: 8 }, (_, i) => ({ title: `local ${i}` })),
    { title: "near", links: ["linked elsewhere"] },
    { title: "close" },
  ])
  const ranked = rankCandidates(local, "local")

  it("one close result takes the sixth place, and the local list goes on after it", () => {
    const out = mergeVectorPages(ranked, [{ title: "near", score: 0.95 }], index, "local")
    expect(titlesOf(out).slice(0, 7)).toEqual([
      "local 0",
      "local 1",
      "local 2",
      "local 3",
      "local 4",
      "near",
      "local 5",
    ])
    expect(out).toHaveLength(9)
  })

  it("results below the bar are not offered, nor ones the head already shows", () => {
    const out = mergeVectorPages(
      ranked,
      [
        { title: "close", score: 0.8 },
        { title: "local 0", score: 0.99 },
      ],
      index,
      "local",
    )
    expect(titlesOf(out)).toEqual(titlesOf(ranked))
  })

  it("a short local list is filled with the rest of the close results", () => {
    const out = mergeVectorPages(
      ranked.slice(0, 2),
      [
        { title: "near", score: 0.86 },
        { title: "linked elsewhere", score: 0.87, exists: false },
        { title: "nowhere", score: 0.88, exists: false },
      ],
      index,
      "local",
    )
    expect(titlesOf(out)).toEqual(["local 0", "local 1", "near", "linked elsewhere"])
  })
})

describe("iconKeys", () => {
  it("the icons a page uses, keyed like titles, and not the ones in code", () => {
    expect([...iconKeys("title\n[Taro Yamada.icon] [/p/x.icon*2] `[a.icon]`")].sort()).toEqual([
      "/p/x",
      "taro_yamada",
    ])
  })
})
