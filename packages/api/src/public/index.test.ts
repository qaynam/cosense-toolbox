import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CosenseApiError,
  createCosenseApi,
  type CosenseProjectApi,
  PageConflictError,
  PageExistsError,
} from "./index"

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/** いつも同じ応答を返す fetch。 */
const respond = (response: () => Response) => (async () => response()) as typeof globalThis.fetch

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("createCosenseApi (Promise)", () => {
  it("結果を Promise で返す", async () => {
    const api = createCosenseApi({ fetch: respond(() => json({ id: "u1", name: "taro" })) })
    expect(await api.getMe()).toMatchObject({ id: "u1", name: "taro" })
  })

  it("あるページは、そのまま返す", async () => {
    const api = createCosenseApi({
      fetch: respond(() => json({ id: "page1", title: "My Page", lines: [] })),
    })
    expect(await api.project("myproject").getPage("My Page")).toMatchObject({ id: "page1" })
  })

  it("無いページは null", async () => {
    const api = createCosenseApi({ fetch: respond(() => new Response("", { status: 404 })) })
    expect(await api.project("myproject").getPage("Missing")).toBeNull()
  })

  it("無いページの本文も null", async () => {
    const api = createCosenseApi({ fetch: respond(() => new Response("", { status: 404 })) })
    expect(await api.project("myproject").getPageText("Missing")).toBeNull()
  })

  it("失敗すると CosenseApiError で reject する", async () => {
    const api = createCosenseApi({
      fetch: respond(() => json({ error: "SomeError" }, 403)),
    })
    const failure = await api.getMe().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(CosenseApiError)
    expect(failure).toMatchObject({ status: 403, code: "SomeError", kind: "forbidden" })
  })

  // workerd は、呼んだ人が catch していても、受け取る人のいないまま reject された Promise を未処理と報告する。
  it("失敗しても、受け取る人のいないまま reject された Promise を作らない", async () => {
    const reject = vi.spyOn(Promise, "reject")
    const api = createCosenseApi({ fetch: respond(() => json({ error: "SomeError" }, 403)) })
    await api.getMe().catch(() => undefined)
    expect(reject).not.toHaveBeenCalled()
  })

  it("origin が http(s) の origin でなければ、作るときに TypeError を投げる", () => {
    expect(() => createCosenseApi({ origin: "not a url" })).toThrow(TypeError)
  })

  it("listProjects() は、自分の入っているプロジェクトを返す", async () => {
    const api = createCosenseApi({
      fetch: respond(() => json({ projects: [{ id: "p1", name: "help-jp" }] })),
    })
    expect(await api.listProjects()).toMatchObject([{ name: "help-jp" }])
  })

  it("project() は、渡した名前を name に持つ", () => {
    expect(createCosenseApi().project("help-jp").name).toBe("help-jp")
  })

  it("project() は、名前が .. なら TypeError を投げる", () => {
    expect(() => createCosenseApi().project("..")).toThrow(TypeError)
  })

  it("fetch を渡さなければ、呼んだときの globalThis.fetch で送る", async () => {
    const api = createCosenseApi()
    const fetch = vi.fn(respond(() => json({ id: "u1" })))
    vi.stubGlobal("fetch", fetch)
    await api.getMe()
    expect(fetch).toHaveBeenCalledWith("https://scrapbox.io/api/users/me", expect.anything())
  })
})

describe("project() (Promise)", () => {
  const ORIGIN = "https://scrapbox.io"
  const BASE = { id: "p1", title: "A b", commitId: "c1", lines: [{ id: "l1", text: "A b" }] }

  const requests: readonly (readonly [
    string,
    (project: CosenseProjectApi) => Promise<unknown>,
    string,
    unknown,
  ])[] = [
    ["getProject", (p) => p.getProject(), "/api/projects/help-jp", undefined],
    ["listUsers", (p) => p.listUsers(), "/api/projects/help-jp/users", undefined],
    ["listPages", (p) => p.listPages({ limit: 10 }), "/api/pages/help-jp/?limit=10", undefined],
    ["getPage", (p) => p.getPage("A b"), "/api/pages/v2/help-jp/A_b/?followRename=true", undefined],
    ["getPageText", (p) => p.getPageText("A b"), "/api/pages/help-jp/A_b/text", undefined],
    [
      "getRelatedPages",
      (p) => p.getRelatedPages("A b"),
      "/api/pages/v2/help-jp/A_b/links1hop",
      undefined,
    ],
    ["getInfobox", (p) => p.getInfobox("p1"), "/api/pages/help-jp/p1/infobox", undefined],
    [
      "getLiterateDatabase",
      (p) => p.getLiterateDatabase("A b"),
      "/api/pages/v2/help-jp/A_b/?followRename=true",
      undefined,
    ],
    [
      "exportForAi",
      (p) => p.exportForAi("A b", { hop: 2, search: "s" }),
      "/api/smart-context/export-2hop-links/help-jp.txt?title=A+b&search=s",
      undefined,
    ],
    [
      "searchFullText",
      (p) => p.searchFullText("q"),
      "/api/pages/help-jp/search/query?q=q&skip=0&limit=100&sort=pageRank&field=lines",
      undefined,
    ],
    [
      "searchVector",
      (p) => p.searchVector("q"),
      "/api/pages/help-jp/search/vector/titles?q=q",
      undefined,
    ],
    ["listTitles", (p) => p.listTitles(), "/api/pages/help-jp/search/titles", undefined],
    ["listSnapshots", (p) => p.listSnapshots("p1"), "/api/page-snapshots/help-jp/p1", undefined],
    [
      "getSnapshot",
      (p) => p.getSnapshot("p1", "s1"),
      "/api/page-snapshots/help-jp/p1/s1",
      undefined,
    ],
    [
      "previewEdit",
      (p) => p.previewEdit({ changes: [] }),
      "/api/pages/v2/help-jp/page-edit-for-ai/preview",
      JSON.stringify({ changes: [] }),
    ],
    [
      "submitEdit",
      (p) => p.submitEdit("pv1"),
      "/api/pages/v2/help-jp/page-edit-for-ai/submit",
      JSON.stringify({ previewId: "pv1" }),
    ],
    [
      "replaceLinks",
      (p) => p.replaceLinks("from", "to"),
      "/api/pages/help-jp/replace/links",
      JSON.stringify({ from: "from", to: "to" }),
    ],
    ["markAccessed", (p) => p.markAccessed("p1"), "/api/pages/help-jp/p1/accessed", "{}"],
    [
      "disableInfoboxExtraction",
      (p) => p.disableInfoboxExtraction("p1", "Recipe"),
      "/api/pages/help-jp/p1/infobox/disable-links",
      JSON.stringify({ title: "Recipe", action: "add" }),
    ],
    [
      "enableInfoboxExtraction",
      (p) => p.enableInfoboxExtraction("p1", "Recipe"),
      "/api/pages/help-jp/p1/infobox/disable-links",
      JSON.stringify({ title: "Recipe", action: "remove" }),
    ],
    [
      "requestInfoboxExtraction",
      (p) => p.requestInfoboxExtraction("p1"),
      "/api/pages/help-jp/p1/infobox/update-result",
      undefined,
    ],
    [
      "updatePage",
      (p) => p.updatePage(BASE, ["A b", "本文"]),
      "/api/pages/v2/help-jp/page-edit-for-ai/preview",
      expect.stringContaining('"pageId":"p1"'),
    ],
    [
      "createPage",
      (p) => p.createPage(["A b", "本文"]),
      "/api/pages/v2/help-jp/A_b/?followRename=true",
      undefined,
    ],
  ]

  it.each(requests)("%s() は、そのプロジェクトに要求を送る", async (_, call, path, body) => {
    const sent: (readonly [string, unknown])[] = []
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push([String(input), init?.body])
      return new Response("", { status: 404 })
    }) as typeof globalThis.fetch
    await call(createCosenseApi({ fetch }).project("help-jp")).catch(() => undefined)
    expect(sent).toContainEqual([`${ORIGIN}${path}`, body])
  })
})

describe("書き込み (Promise)", () => {
  it("previewEdit() の失敗は、code 付きの CosenseApiError で reject する", async () => {
    const api = createCosenseApi({ fetch: respond(() => json({ error: "NotFastForward" }, 409)) })
    await expect(api.project("myproject").previewEdit({ changes: [] })).rejects.toMatchObject({
      status: 409,
      code: "NotFastForward",
    })
  })

  it("markAccessed() は、記録できなくても resolve する", async () => {
    const api = createCosenseApi({ fetch: respond(() => json({}, 500)) })
    await expect(api.project("myproject").markAccessed("page1")).resolves.toBeUndefined()
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
      createCosenseApi({ fetch }).project("myproject").updatePage(base, ["Title", "ours"]),
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
    await expect(api.project("myproject").createPage(["Title", "本文"])).rejects.toBeInstanceOf(
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

  it("URL として読めない文字列は、CosenseApiError で reject する", async () => {
    const api = createCosenseApi({ fetch: respond(() => new Response("x")) })
    const failure = await api.fetchAsset("not a url").catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(CosenseApiError)
    expect(failure).toMatchObject({ kind: "invalidUrl" })
  })
})
