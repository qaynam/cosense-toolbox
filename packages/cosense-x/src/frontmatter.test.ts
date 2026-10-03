import { describe, expect, it } from "vitest"

import { splitFrontmatter } from "./frontmatter"

describe("splitFrontmatter", () => {
  it("ファイル先頭の YAML を本文から切り離す", () => {
    const result = splitFrontmatter("---\nslug: hello\ndraft: true\n---\nタイトル\n本文")
    expect(result.data).toEqual({ slug: "hello", draft: true })
    expect(result.body).toBe("タイトル\n本文")
  })

  it("YAML が無ければ本文をそのまま返す", () => {
    const result = splitFrontmatter("タイトル\n本文")
    expect(result.data).toEqual({})
    expect(result.body).toBe("タイトル\n本文")
  })

  it("先頭以外の --- は frontmatter とみなさない", () => {
    const source = "タイトル\n---\nslug: a\n---\n本文"
    expect(splitFrontmatter(source)).toEqual({ data: {}, body: source })
  })

  it("閉じの --- が無ければ frontmatter とみなさない", () => {
    const source = "---\nタイトル\n本文"
    expect(splitFrontmatter(source).body).toBe(source)
  })

  it("空の frontmatter は空のオブジェクトになる", () => {
    const result = splitFrontmatter("---\n---\nタイトル")
    expect(result.data).toEqual({})
    expect(result.body).toBe("タイトル")
  })

  it("CRLF の改行でも読める", () => {
    const result = splitFrontmatter("---\r\nslug: a\r\n---\r\nタイトル")
    expect(result.data).toEqual({ slug: "a" })
    expect(result.body).toBe("タイトル")
  })

  it("壊れた YAML はエラーになる", () => {
    expect(() => splitFrontmatter("---\nslug: [\n---\nタイトル")).toThrow(/frontmatter/)
  })

  it("オブジェクトでない YAML はエラーになる", () => {
    expect(() => splitFrontmatter("---\n- a\n---\nタイトル")).toThrow(/frontmatter/)
  })
})
