import { afterEach, describe, expect, it, vi } from "vitest"

import { CosenseApiError, createCosenseApi, PageConflictError, PageExistsError } from "./index"

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/** いつも同じ応答を返す fetch。 */
const respond = (response: () => Response) => (async () => response()) as typeof globalThis.fetch

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createCosenseApi (Promise)", () => {
  it("結果を Promise で返す", async () => {
    const api = createCosenseApi({ fetch: respond(() => json({ id: "u1", name: "taro" })) })
    expect(await api.me()).toMatchObject({ id: "u1", name: "taro" })
  })

  it("あるページは、そのまま返す", async () => {
    const api = createCosenseApi({
      fetch: respond(() => json({ id: "page1", title: "My Page", lines: [] })),
    })
    expect(await api.getPage("myproject", "My Page")).toMatchObject({ id: "page1" })
  })

  it("無いページは null", async () => {
    const api = createCosenseApi({ fetch: respond(() => new Response("", { status: 404 })) })
    expect(await api.getPage("myproject", "Missing")).toBeNull()
  })

  it("無いページの本文も null", async () => {
    const api = createCosenseApi({ fetch: respond(() => new Response("", { status: 404 })) })
    expect(await api.getPageText("myproject", "Missing")).toBeNull()
  })

  it("失敗すると CosenseApiError で reject する", async () => {
    const api = createCosenseApi({
      fetch: respond(() => json({ error: "SomeError" }, 403)),
    })
    const failure = await api.me().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(CosenseApiError)
    expect(failure).toMatchObject({ status: 403, code: "SomeError", kind: "forbidden" })
  })

  it("fetch を渡さなければ、呼んだときの globalThis.fetch で送る", async () => {
    const api = createCosenseApi()
    const fetch = vi.fn(respond(() => json({ id: "u1" })))
    vi.stubGlobal("fetch", fetch)
    await api.me()
    expect(fetch).toHaveBeenCalledWith("https://scrapbox.io/api/users/me", expect.anything())
  })
})

describe("書き込み (Promise)", () => {
  it("previewEdit() の失敗は、code 付きの CosenseApiError で reject する", async () => {
    const api = createCosenseApi({ fetch: respond(() => json({ error: "NotFastForward" }, 409)) })
    await expect(api.previewEdit("myproject", { changes: [] })).rejects.toMatchObject({
      status: 409,
      code: "NotFastForward",
    })
  })

  it("markAccessed() は、記録できなくても resolve する", async () => {
    const api = createCosenseApi({ fetch: respond(() => json({}, 500)) })
    await expect(api.markAccessed("myproject", "page1")).resolves.toBeUndefined()
  })
})

describe("updatePage (Promise)", () => {
  it("同じ行のコンフリクトは、PageConflictError で reject する", async () => {
    const fetch = (async (input: string | URL | Request) =>
      String(input).endsWith("/preview")
        ? json({ previewId: "p", pagePreview: { commitId: "c1" } })
        : json({
            id: "page1",
            commitId: "c1",
            lines: [
              { id: "l1", text: "Title" },
              { id: "l2", text: "theirs" },
            ],
          })) as typeof globalThis.fetch
    const base = {
      id: "page1",
      title: "Title",
      commitId: "c0",
      lines: [
        { id: "l1", text: "Title" },
        { id: "l2", text: "alpha" },
      ],
    }
    await expect(
      createCosenseApi({ fetch }).updatePage("myproject", base, ["Title", "ours"]),
    ).rejects.toBeInstanceOf(PageConflictError)
  })
})

describe("createPage (Promise)", () => {
  it("同じタイトルのページがあれば、PageExistsError で reject する", async () => {
    const api = createCosenseApi({
      fetch: respond(() =>
        json({ id: "page9", title: "Title", commitId: "c5", persistent: true, lines: [] }),
      ),
    })
    await expect(api.createPage("myproject", ["Title", "本文"])).rejects.toBeInstanceOf(
      PageExistsError,
    )
  })
})

describe("fetchAsset (Promise)", () => {
  it("createCosenseApi に渡した pat と fetch で、ファイルを取る", async () => {
    const fetch = vi.fn(
      respond(() => new Response("x", { headers: { "content-type": "image/png" } })),
    )
    const asset = await createCosenseApi({ fetch, pat: "dummy-secret-pat" }).fetchAsset(
      "https://scrapbox.io/files/abc.png",
    )
    expect(asset.contentType).toBe("image/png")
    expect(fetch).toHaveBeenCalledWith(
      "https://scrapbox.io/files/abc.png",
      expect.objectContaining({ headers: { "x-personal-access-token": "dummy-secret-pat" } }),
    )
  })
})
