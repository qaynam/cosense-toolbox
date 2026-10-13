import { afterEach, describe, expect, it, vi } from "vitest"

import { CosenseApiError, createCosenseApi } from "./index"

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
    expect(failure).toMatchObject({ status: 403, code: "SomeError" })
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
