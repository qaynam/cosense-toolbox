import { parseLine } from "@cosense-toolbox/parser"
import type { PageRefNode } from "@cosense-toolbox/parser/html"
import { describe, expect, it } from "vitest"

import { createIndex, createLinkResolver, findByTitle } from "./links"

const index = createIndex([
  { id: "posts/a.csn", title: "Page A", slug: "page-a" },
  { id: "posts/a2.csn", title: "page_a", slug: "page-a-2" },
  { id: "posts/draft.csn", title: "下書き", slug: "draft", draft: true },
])

/** `[title]` 1 つだけの行から、リンクのノードを取り出す。 */
const linkOf = (text: string): PageRefNode => {
  const node = parseLine(text).children[0]
  if (node?.type !== "internalLink") throw new Error(`リンクではない: ${text}`)
  return node
}

describe("createIndex / findByTitle", () => {
  it("同じタイトルのページが複数あれば、先に渡したほうを引く", () => {
    expect(findByTitle(index, "PAGE A")?.id).toBe("posts/a.csn")
  })

  it("draft のページは索引に載せない", () => {
    expect(findByTitle(index, "下書き")).toBeUndefined()
    expect(index.pages["posts/draft.csn"]).toBeUndefined()
  })
})

describe("createLinkResolver", () => {
  it("unresolved: 'warn' なら、渡した配列にリンク切れを積んでテキストにする", () => {
    const warnings: string[] = []
    const resolve = createLinkResolver({ index, unresolved: "warn" }, warnings)
    expect(resolve(linkOf("[無いページ]"))).toBeNull()
    expect(warnings).toEqual(["リンク先のページが見つからない: [無いページ]"])
  })

  it("unresolved: 'error' なら、リンク切れで例外を投げる", () => {
    const resolve = createLinkResolver({ index, unresolved: "error", filePath: "posts/b.csn" })
    expect(() => resolve(linkOf("[無いページ]"))).toThrow(
      "リンク先のページが見つからない: [無いページ] (posts/b.csn)",
    )
  })
})
