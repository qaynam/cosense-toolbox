import { Effect, Either, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"

import { createCosenseApi } from "./api"
import { CosenseApiError, PageConflictError, PageExistsError } from "./errors"
import { HttpClient, HttpClientError } from "./http-client"

const PAT = "dummy-secret-pat"

interface Call {
  readonly url: string
  readonly init: RequestInit
}

/** 応答を決める関数を HttpClient にする。呼ばれた URL と要求を記録する。 */
const testHttpClient = (
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): { layer: Layer.Layer<HttpClient>; calls: Call[] } => {
  const calls: Call[] = []
  const layer = Layer.succeed(
    HttpClient,
    HttpClient.of({
      fetch: (input, init) => {
        calls.push({ url: input, init })
        return Effect.promise(() => Promise.resolve(handler(input, init)))
      },
    }),
  )
  return { layer, calls }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const run = <A, E>(
  effect: Effect.Effect<A, E, HttpClient>,
  layer: Layer.Layer<HttpClient>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, layer))

const runFailure = <A, E>(
  effect: Effect.Effect<A, E, HttpClient>,
  layer: Layer.Layer<HttpClient>,
): Promise<E> => Effect.runPromise(Effect.flip(Effect.provide(effect, layer)))

const headersOf = (call: Call | undefined): Record<string, string> =>
  call?.init.headers as Record<string, string>

const api = createCosenseApi({ pat: PAT })

describe("認証", () => {
  it("pat を渡すと x-personal-access-token を付ける", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(api.me(), layer)
    expect(headersOf(calls[0])["x-personal-access-token"]).toBe(PAT)
  })

  it("pat を渡さなければ、認証のヘッダを付けずに読む (公開プロジェクト)", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(createCosenseApi().me(), layer)
    expect(headersOf(calls[0])).toEqual({})
  })

  it("origin を渡さなければ https://scrapbox.io に送る", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(createCosenseApi().me(), layer)
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/users/me")
  })

  it("origin を渡すと、そこに送る", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(createCosenseApi({ origin: "https://cosense.example" }).me(), layer)
    expect(calls[0]?.url).toBe("https://cosense.example/api/users/me")
  })

  it("origin の後ろに / があっても、/ を重ねずに送る", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(createCosenseApi({ origin: "https://cosense.example/" }).me(), layer)
    expect(calls[0]?.url).toBe("https://cosense.example/api/users/me")
  })

  it("origin は http でもよい", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(createCosenseApi({ origin: "http://localhost:8787" }).me(), layer)
    expect(calls[0]?.url).toBe("http://localhost:8787/api/users/me")
  })

  it("origin が URL として読めなければ、作るときに、その値を示す TypeError を投げる", () => {
    expect(() => createCosenseApi({ origin: "cosense.example" })).toThrow(TypeError)
    expect(() => createCosenseApi({ origin: "cosense.example" })).toThrow("cosense.example")
  })

  it("origin が http(s) でなければ、作るときに TypeError を投げる", () => {
    expect(() => createCosenseApi({ origin: "wss://cosense.example" })).toThrow(TypeError)
  })

  it("origin にパスが付いていれば、作るときに TypeError を投げる", () => {
    expect(() => createCosenseApi({ origin: "https://cosense.example/api" })).toThrow(TypeError)
  })
})

describe("プロジェクト名", () => {
  const PROJECT = "a/../b"
  const ENCODED = "/a%2F..%2Fb"

  const requests: readonly (readonly [
    string,
    () => Effect.Effect<unknown, unknown, HttpClient>,
  ])[] = [
    ["projectDetail", () => api.projectDetail(PROJECT)],
    ["projectUsers", () => api.projectUsers(PROJECT)],
    ["listPages", () => api.listPages(PROJECT)],
    ["getPage", () => api.getPage(PROJECT, "title")],
    ["getPageText", () => api.getPageText(PROJECT, "title")],
    ["relatedPages", () => api.relatedPages(PROJECT, "title")],
    ["getInfobox", () => api.getInfobox(PROJECT, "page1")],
    ["literateDatabase", () => api.literateDatabase(PROJECT, "title")],
    ["exportForAi", () => api.exportForAi(PROJECT, "title", 1)],
    ["searchFullText", () => api.searchFullText(PROJECT, "query")],
    ["searchVector", () => api.searchVector(PROJECT, "query")],
    ["searchTitles", () => api.searchTitles(PROJECT)],
    ["pageSnapshots", () => api.pageSnapshots(PROJECT, "page1")],
    ["pageSnapshot", () => api.pageSnapshot(PROJECT, "page1", "snapshot1")],
    ["previewEdit", () => api.previewEdit(PROJECT, { changes: [] })],
    ["submitEdit", () => api.submitEdit(PROJECT, "preview1")],
    ["replaceLinks", () => api.replaceLinks(PROJECT, "from", "to")],
    ["markAccessed", () => api.markAccessed(PROJECT, "page1")],
    ["disableInfoboxExtraction", () => api.disableInfoboxExtraction(PROJECT, "page1", "Recipe")],
    ["enableInfoboxExtraction", () => api.enableInfoboxExtraction(PROJECT, "page1", "Recipe")],
    ["updateInfoboxResult", () => api.updateInfoboxResult(PROJECT, "page1")],
    [
      "updatePage",
      () => api.updatePage(PROJECT, { id: "p", title: "t", commitId: "c", lines: [] }, ["t"]),
    ],
    ["createPage", () => api.createPage(PROJECT, ["title"])],
  ]

  it.each(requests)(
    "%s() は、/ や .. を含む名前も、パスの 1 つの区切りの中に収めて送る",
    async (_, call) => {
      const { layer, calls } = testHttpClient(() => json({}, 404))
      await Effect.runPromise(Effect.either(Effect.provide(call(), layer)))
      expect(calls[0]?.url).toContain(ENCODED)
    },
  )
})

describe("読み取り", () => {
  it("me() は、無い項目を空の値にして返す", async () => {
    const { layer } = testHttpClient(() => json({ id: "u1", name: "taro", displayName: "Taro" }))
    expect(await run(api.me(), layer)).toEqual({
      id: "u1",
      name: "taro",
      displayName: "Taro",
      pageFilters: [],
    })
  })

  it("projects() は、応答の projects を返す", async () => {
    const { layer } = testHttpClient(() => json({ projects: [{ id: "p1", name: "myproject" }] }))
    const result = await run(api.projects(), layer)
    expect(result.map((project) => project.name)).toEqual(["myproject"])
  })

  it("projectDetail() は、画像の送り先の設定を返す", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({ id: "p1", name: "myproject", uploadImageTo: "gyazo" }),
    )
    const result = await run(api.projectDetail("myproject"), layer)
    expect(result).toMatchObject({ uploadImageTo: "gyazo", gyazoTeamsName: null })
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/projects/myproject")
  })

  it("projectDetail() は、Infobox を使うプロジェクトかを返す", async () => {
    const { layer } = testHttpClient(() => json({ id: "p1", name: "myproject", infobox: true }))
    expect(await run(api.projectDetail("myproject"), layer)).toMatchObject({ infobox: true })
  })

  it("projectUsers() は、今のメンバーと抜けたメンバーを合わせて返す", async () => {
    const { layer } = testHttpClient(() =>
      json({
        projectId: "p1",
        users: [{ id: "u1", name: "taro" }],
        memberSnapshots: [{ data: { id: "u2", name: "hanako" } }, {}],
      }),
    )
    expect(await run(api.projectUsers("myproject"), layer)).toEqual({
      projectId: "p1",
      users: [
        { id: "u1", name: "taro" },
        { id: "u2", name: "hanako" },
      ],
    })
  })

  it("listPages() は、並び順と範囲をクエリにして、件数とページを返す", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({ count: 2, pages: [{ id: "a" }, { id: "b" }] }),
    )
    const result = await run(
      api.listPages("myproject", { sort: "updated", limit: 10, skip: 5 }),
      layer,
    )
    expect(result.count).toBe(2)
    expect(result.pages).toHaveLength(2)
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/pages/myproject/?sort=updated&limit=10&skip=5",
    )
  })

  it("listPages() の絞り込みは、filterType と filterValue の両方があるときだけ送る", async () => {
    const { layer, calls } = testHttpClient(() => json({}))
    await run(api.listPages("myproject", { filterType: "icon" }), layer)
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/pages/myproject/")
  })
})

describe("getPage", () => {
  it("あるページは、無い項目を 0 や空にして返す", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({
        id: "page1",
        title: "My Page",
        commitId: "commit1",
        persistent: true,
        lines: [{ id: "line1", text: "hello" }],
        updated: 1700000000,
        views: 12,
      }),
    )
    const page = await run(api.getPage("myproject", "My Page"), layer)
    expect(page).toEqual(
      Option.some({
        id: "page1",
        title: "My Page",
        commitId: "commit1",
        lines: [{ id: "line1", text: "hello", updated: 0, userId: "" }],
        created: 0,
        updated: 1700000000,
        accessed: 0,
        views: 12,
        linked: 0,
        linesCount: 0,
        charsCount: 0,
        pin: 0,
        pageRank: 0,
        snapshotCount: 0,
        infoboxDefinition: [],
        infoboxResult: [],
        infoboxDisableLinks: [],
      }),
    )
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/pages/v2/myproject/My_Page/?followRename=true",
    )
  })

  it("Infobox の定義と、本文から抜き出した値と、抜き出しを止めた定義ページを返す", async () => {
    const { layer } = testHttpClient(() =>
      json({
        id: "page1",
        title: "Tomato Soup",
        persistent: true,
        infoboxDefinition: ["Ingredients", "Category\tAnswer one of: soup, salad"],
        infoboxResult: [
          {
            title: "Recipe",
            infobox: { Ingredients: "tomato\nonion", Category: "soup" },
            hallucination: false,
            truncated: true,
            error: { code: "context_length_exceeded" },
          },
        ],
        infoboxDisableLinks: ["food_log"],
      }),
    )
    const page = await run(api.getPage("myproject", "Tomato Soup"), layer)
    expect(Option.getOrThrow(page)).toMatchObject({
      infoboxDefinition: ["Ingredients", "Category\tAnswer one of: soup, salad"],
      infoboxResult: [
        {
          title: "Recipe",
          infobox: { Ingredients: "tomato\nonion", Category: "soup" },
          hallucination: false,
          truncated: true,
          error: { code: "context_length_exceeded" },
        },
      ],
      infoboxDisableLinks: ["food_log"],
    })
  })

  it("抜き出した結果の無い項目は空の値にし、文字列でない値は空文字にする", async () => {
    const { layer } = testHttpClient(() =>
      json({
        id: "page1",
        title: "Tomato Soup",
        persistent: true,
        infoboxResult: [
          { infobox: { Servings: 2, Tags: ["a"], Note: null, Category: "soup" } },
          { title: "Food log" },
        ],
      }),
    )
    const page = await run(api.getPage("myproject", "Tomato Soup"), layer)
    expect(Option.getOrThrow(page).infoboxResult).toEqual([
      {
        title: "",
        infobox: { Servings: "", Tags: "", Note: "", Category: "soup" },
        hallucination: false,
        truncated: false,
      },
      { title: "Food log", infobox: {}, hallucination: false, truncated: false },
    ])
  })

  it("タイトルの空白は _ にし、/ は %2F にし、日本語はそのまま送る", async () => {
    const { layer, calls } = testHttpClient(() => json({ persistent: false }))
    await run(api.getPage("myproject", "日本語 タイトル/foo"), layer)
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/pages/v2/myproject/日本語_タイトル%2Ffoo/?followRename=true",
    )
  })

  it("404 なら none", async () => {
    const { layer } = testHttpClient(() => new Response("not found", { status: 404 }))
    expect(await run(api.getPage("myproject", "Missing"), layer)).toEqual(Option.none())
  })

  it("まだ書かれていないページ (persistent: false) も none", async () => {
    const { layer } = testHttpClient(() =>
      json({
        title: "New Page",
        persistent: false,
        id: "placeholder",
        lines: [{ id: "placeholder-line", text: "New Page" }],
      }),
    )
    expect(await run(api.getPage("myproject", "New Page"), layer)).toEqual(Option.none())
  })
})

describe("getPageText", () => {
  it("ページの本文をテキストのまま返す", async () => {
    const { layer, calls } = testHttpClient(() => new Response("My Page\nhello"))
    expect(await run(api.getPageText("myproject", "My Page"), layer)).toEqual(
      Option.some("My Page\nhello"),
    )
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/pages/myproject/My_Page/text")
  })

  it("404 なら none", async () => {
    const { layer } = testHttpClient(() => new Response("not found", { status: 404 }))
    expect(await run(api.getPageText("myproject", "Missing"), layer)).toEqual(Option.none())
  })
})

describe("relatedPages", () => {
  it("1 hop と 2 hop を両方取る", async () => {
    const { layer, calls } = testHttpClient((url) =>
      url.endsWith("/links1hop")
        ? json({ links1hop: [{ id: "a", title: "A" }] })
        : json({ links2hop: [{ id: "b", title: "B" }] }),
    )
    const result = await run(api.relatedPages("myproject", "My Page"), layer)
    expect(result.links1hop).toHaveLength(1)
    expect(result.links2hop).toHaveLength(1)
    expect(calls.map((call) => call.url).sort()).toEqual([
      "https://scrapbox.io/api/pages/v2/myproject/My_Page/links1hop",
      "https://scrapbox.io/api/pages/v2/myproject/My_Page/links2hop",
    ])
  })

  it("続きのページも辿り、1 hop にあるページは 2 hop から除く", async () => {
    const { layer, calls } = testHttpClient((url) => {
      if (url.endsWith("/links1hop")) {
        return json({
          links1hop: [{ id: "a", title: "A", titleLc: "a" }],
          synonyms: [["Taro", "taro_yamada"]],
        })
      }
      if (url.endsWith("/links2hop")) {
        return json({
          links2hop: [{ id: "b", title: "B", titleLc: "b" }],
          pagination: { hasNext: true, nextId: "cursor 1" },
        })
      }
      return json({
        links2hop: [
          { id: "a", title: "A", titleLc: "a" },
          { id: "c", title: "C", titleLc: "c" },
        ],
        hiddenHeadwordsLc: ["hidden"],
        pagination: { hasNext: false, nextId: null },
      })
    })
    const result = await run(api.relatedPages("myproject", "My Page"), layer)
    expect(result.links1hop.map((page) => page.title)).toEqual(["A"])
    expect(result.links2hop.map((page) => page.title)).toEqual(["B", "C"])
    expect(result.hiddenHeadwordsLc).toEqual(["hidden"])
    expect(result.synonyms).toEqual([["Taro", "taro_yamada"]])
    expect(calls.map((call) => call.url)).toContain(
      "https://scrapbox.io/api/pages/v2/myproject/My_Page/links2hop?nextId=cursor%201",
    )
  })

  it("関連ページの Infobox も返す", async () => {
    const { layer } = testHttpClient((url) =>
      url.endsWith("/links1hop")
        ? json({
            links1hop: [
              {
                id: "a",
                title: "Tomato Soup",
                infoboxResult: [{ title: "Recipe", infobox: { Category: "soup" } }],
                infoboxDisableLinks: ["food_log"],
              },
            ],
          })
        : json({ links2hop: [{ id: "b", title: "Recipe", infoboxDefinition: ["Category"] }] }),
    )
    const result = await run(api.relatedPages("myproject", "My Page"), layer)
    expect(result.links1hop[0]).toMatchObject({
      infoboxDefinition: [],
      infoboxResult: [{ title: "Recipe", infobox: { Category: "soup" } }],
      infoboxDisableLinks: ["food_log"],
    })
    expect(result.links2hop[0]).toMatchObject({
      infoboxDefinition: ["Category"],
      infoboxResult: [],
      infoboxDisableLinks: [],
    })
  })
})

describe("getInfobox", () => {
  it("ページの Infobox だけを、ページの id で読む", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({
        infoboxDefinition: [],
        infoboxResult: [{ title: "Recipe", infobox: { Category: "soup" }, hallucination: true }],
        infoboxDisableLinks: ["food_log"],
      }),
    )
    expect(await run(api.getInfobox("myproject", "page1"), layer)).toEqual({
      infoboxDefinition: [],
      infoboxResult: [
        { title: "Recipe", infobox: { Category: "soup" }, hallucination: true, truncated: false },
      ],
      infoboxDisableLinks: ["food_log"],
    })
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/pages/myproject/page1/infobox")
  })
})

describe("literateDatabase", () => {
  const definition = {
    id: "def",
    title: "Recipe",
    persistent: true,
    infoboxDefinition: ["Ingredients", "Category\tAnswer one of: soup, salad", "ExcludeTitleLine"],
  }
  const linkingPage = (title: string, extra: object = {}) => ({
    id: title,
    title,
    titleLc: title.toLowerCase().replace(/ /g, "_"),
    linksLc: ["recipe"],
    ...extra,
  })
  /** 定義ページと、その 1 hop を返す fetch。 */
  const respondWith =
    (page: object, links1hop: object[]) =>
    (url: string): Response =>
      url.includes("/links1hop") ? json({ links1hop }) : json(page)

  it("列は定義の表の行の最初のセルで、ExcludeTitleLine の行は除く", async () => {
    const { layer } = testHttpClient(respondWith(definition, []))
    const table = await run(api.literateDatabase("myproject", "Recipe"), layer)
    expect(Option.getOrThrow(table).fields).toEqual(["Ingredients", "Category"])
  })

  it("行は、定義ページにリンクしているページと、そこから抜き出した値", async () => {
    const { layer } = testHttpClient(
      respondWith(definition, [
        linkingPage("Tomato Soup", {
          infoboxResult: [{ title: "Recipe", infobox: { Category: "soup" } }],
        }),
      ]),
    )
    const table = await run(api.literateDatabase("myproject", "Recipe"), layer)
    expect(Option.getOrThrow(table).rows.map((row) => [row.page.title, row.infobox])).toEqual([
      ["Tomato Soup", { Category: "soup" }],
    ])
  })

  it("定義ページからリンクしているだけのページは、行にしない", async () => {
    const { layer } = testHttpClient(
      respondWith(definition, [linkingPage("Kitchen", { linksLc: ["cooking"] })]),
    )
    const table = await run(api.literateDatabase("myproject", "Recipe"), layer)
    expect(Option.getOrThrow(table).rows).toEqual([])
  })

  it("抜き出しを止めたページは、行にしない", async () => {
    const { layer } = testHttpClient(
      respondWith(definition, [linkingPage("Food Log", { infoboxDisableLinks: ["recipe"] })]),
    )
    const table = await run(api.literateDatabase("myproject", "Recipe"), layer)
    expect(Option.getOrThrow(table).rows).toEqual([])
  })

  it("値は、大文字と小文字、空白と _ を区別せずに定義ページのタイトルが合う結果から取る", async () => {
    const { layer } = testHttpClient(
      respondWith({ ...definition, title: "Weekly Recipe" }, [
        linkingPage("Tomato Soup", {
          linksLc: ["weekly_recipe"],
          infoboxResult: [
            { title: "Food Log", infobox: { Category: "lunch" } },
            { title: "weekly_recipe", infobox: { Category: "soup" } },
          ],
        }),
      ]),
    )
    const table = await run(api.literateDatabase("myproject", "Weekly Recipe"), layer)
    expect(Option.getOrThrow(table).rows[0]?.infobox).toEqual({ Category: "soup" })
  })

  it("まだ抜き出していないページの値は空", async () => {
    const { layer } = testHttpClient(respondWith(definition, [linkingPage("Tomato Soup")]))
    const table = await run(api.literateDatabase("myproject", "Recipe"), layer)
    expect(Option.getOrThrow(table).rows[0]?.infobox).toEqual({})
  })

  it("1 hop は、名前を変えた後の今のタイトルで、続きのページも辿って取る", async () => {
    const { layer, calls } = testHttpClient((url) => {
      if (url.endsWith("/links1hop")) {
        return json({
          links1hop: [linkingPage("Tomato Soup")],
          pagination: { hasNext: true, nextId: "next" },
        })
      }
      if (url.includes("/links1hop?")) return json({ links1hop: [linkingPage("Green Salad")] })
      return json(definition)
    })
    const table = await run(api.literateDatabase("myproject", "Old Recipe"), layer)
    expect(Option.getOrThrow(table).rows.map((row) => row.page.title)).toEqual([
      "Tomato Soup",
      "Green Salad",
    ])
    expect(calls.map((call) => call.url)).toEqual([
      "https://scrapbox.io/api/pages/v2/myproject/Old_Recipe/?followRename=true",
      "https://scrapbox.io/api/pages/v2/myproject/Recipe/links1hop",
      "https://scrapbox.io/api/pages/v2/myproject/Recipe/links1hop?nextId=next",
    ])
  })

  it("定義ページでなければ none で、1 hop を取らない", async () => {
    const { layer, calls } = testHttpClient(
      respondWith({ ...definition, infoboxDefinition: [] }, []),
    )
    expect(await run(api.literateDatabase("myproject", "Recipe"), layer)).toEqual(Option.none())
    expect(calls).toHaveLength(1)
  })

  it("ページが無ければ none", async () => {
    const { layer } = testHttpClient(() => new Response("not found", { status: 404 }))
    expect(await run(api.literateDatabase("myproject", "Missing"), layer)).toEqual(Option.none())
  })
})

describe("Infobox の抜き出し", () => {
  const infobox = {
    infoboxDefinition: [],
    infoboxResult: [{ title: "Recipe", infobox: { Category: "soup" } }],
    infoboxDisableLinks: ["recipe"],
  }

  it("disableInfoboxExtraction() は、定義ページのタイトルを止めるものに足し、止めた後の Infobox を返す", async () => {
    const { layer, calls } = testHttpClient(() => json(infobox))
    const result = await run(api.disableInfoboxExtraction("myproject", "page1", "Recipe"), layer)
    expect(result.infoboxDisableLinks).toEqual(["recipe"])
    expect(calls.map((call) => [call.url, call.init.method, call.init.body])).toEqual([
      [
        "https://scrapbox.io/api/pages/myproject/page1/infobox/disable-links",
        "POST",
        JSON.stringify({ title: "Recipe", action: "add" }),
      ],
    ])
  })

  it("enableInfoboxExtraction() は、定義ページのタイトルを止めるものから除き、戻した後の Infobox を返す", async () => {
    const { layer, calls } = testHttpClient(() => json({ ...infobox, infoboxDisableLinks: [] }))
    const result = await run(api.enableInfoboxExtraction("myproject", "page1", "Recipe"), layer)
    expect(result.infoboxDisableLinks).toEqual([])
    expect(calls.map((call) => [call.url, call.init.method, call.init.body])).toEqual([
      [
        "https://scrapbox.io/api/pages/myproject/page1/infobox/disable-links",
        "POST",
        JSON.stringify({ title: "Recipe", action: "remove" }),
      ],
    ])
  })

  it("updateInfoboxResult() は、抜き出し直すよう POST で頼む", async () => {
    const { layer, calls } = testHttpClient(() => json({}))
    await run(api.updateInfoboxResult("myproject", "page1"), layer)
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ["https://scrapbox.io/api/pages/myproject/page1/infobox/update-result", "POST"],
    ])
  })

  it("updateInfoboxResult() は、応答の本文が JSON でなくても成功する", async () => {
    const { layer } = testHttpClient(() => new Response("OK"))
    expect(await run(api.updateInfoboxResult("myproject", "page1"), layer)).toBeUndefined()
  })

  it("updateInfoboxResult() は、断られたらそのエラーで失敗する", async () => {
    const { layer } = testHttpClient(() => json({ error: "Forbidden" }, 403))
    expect(await runFailure(api.updateInfoboxResult("myproject", "page1"), layer)).toMatchObject({
      status: 403,
      kind: "forbidden",
    })
  })
})

describe("exportForAi", () => {
  it("指定した hop の書き出しをテキストのまま返す", async () => {
    const { layer, calls } = testHttpClient(
      () => new Response("page text", { headers: { "content-type": "text/plain" } }),
    )
    expect(await run(api.exportForAi("myproject", "My Page", 1), layer)).toBe("page text")
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/smart-context/export-1hop-links/myproject.txt?title=My+Page",
    )
  })

  it("search は前後の空白を除いて送る", async () => {
    const { layer, calls } = testHttpClient(() => new Response("text"))
    await run(api.exportForAi("myproject", "ページ", 2, " 検索 "), layer)
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/smart-context/export-2hop-links/myproject.txt?title=%E3%83%9A%E3%83%BC%E3%82%B8&search=%E6%A4%9C%E7%B4%A2",
    )
  })

  it("空白だけの search は送らない", async () => {
    const { layer, calls } = testHttpClient(() => new Response("text"))
    await run(api.exportForAi("myproject", "ページ", 2, "   "), layer)
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/smart-context/export-2hop-links/myproject.txt?title=%E3%83%9A%E3%83%BC%E3%82%B8",
    )
  })
})

describe("検索", () => {
  it("searchFullText() は、本文 (field=lines) を pageRank 順に 100 件まで探す", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({ count: 1, existsExactTitleMatch: true, pages: [{ id: "a", title: "A" }] }),
    )
    const result = await run(api.searchFullText("myproject", "hello world"), layer)
    expect(result.count).toBe(1)
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/pages/myproject/search/query?q=hello+world&skip=0&limit=100&sort=pageRank&field=lines",
    )
  })

  it("searchVector() は、ベクトル検索が無効なプロジェクト (490) なら空の結果を返す", async () => {
    const { layer } = testHttpClient(() => new Response("feature disabled", { status: 490 }))
    expect(await run(api.searchVector("myproject", "q"), layer)).toEqual({ pages: [] })
  })

  it("searchTitles() は、配列だけの応答も読む", async () => {
    const { layer } = testHttpClient(() =>
      json([{ id: "a", title: "A", titleLc: "a", updated: 1, image: null }]),
    )
    const result = await run(api.searchTitles("myproject"), layer)
    expect(result.map((entry) => entry.title)).toEqual(["A"])
    expect(result[0]?.links).toEqual([])
  })

  it("searchTitles() は、各ページから出ているリンクも返す", async () => {
    const { layer } = testHttpClient(() =>
      json([{ id: "a", title: "A", titleLc: "a", updated: 1, image: null, links: ["B", "C"] }]),
    )
    const result = await run(api.searchTitles("myproject"), layer)
    expect(result[0]?.links).toEqual(["B", "C"])
  })
})

describe("searchTitles はプロジェクト全体を辿る", () => {
  const titlePage = (count: number, followingId: string | null): Response =>
    new Response(
      JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: String(i), title: `t${i}` }))),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...(followingId === null ? {} : { "x-following-id": followingId }),
        },
      },
    )

  it("1 回に 10000 件までなので、x-following-id を辿って続きを取る", async () => {
    let call = 0
    const { layer, calls } = testHttpClient(() => {
      call++
      return call === 1 ? titlePage(10000, "second") : titlePage(7, null)
    })
    const titles = await run(api.searchTitles("big"), layer)
    expect(titles).toHaveLength(10007)
    expect(calls[1]?.url).toContain("followingId=second")
  })

  it("1 回に収まるプロジェクトは 1 回で終わる", async () => {
    const { layer, calls } = testHttpClient(() => titlePage(12, null))
    const titles = await run(api.searchTitles("small"), layer)
    expect(titles).toHaveLength(12)
    expect(calls).toHaveLength(1)
  })

  it("ちょうど 10000 件でも、x-following-id が無ければ終わる", async () => {
    const { layer, calls } = testHttpClient(() => titlePage(10000, null))
    const titles = await run(api.searchTitles("exact"), layer)
    expect(titles).toHaveLength(10000)
    expect(calls).toHaveLength(1)
  })

  it("10000 件に届かなければ、x-following-id があっても終わりとみなす", async () => {
    const { layer, calls } = testHttpClient(() => titlePage(12, "next"))
    await run(api.searchTitles("small"), layer)
    expect(calls).toHaveLength(1)
  })

  it("件数で切らずに、20 万件を超えても最後まで取る", async () => {
    let call = 0
    const { layer } = testHttpClient(() => {
      call++
      return call <= 21 ? titlePage(10000, `p${call}`) : titlePage(7, null)
    })
    const titles = await run(api.searchTitles("huge"), layer)
    expect(titles).toHaveLength(210007)
  })

  it("同じ x-following-id を返し続けるサーバーでは、途中までを返さずに失敗する", async () => {
    const { layer, calls } = testHttpClient(() => titlePage(10000, "again"))
    const failure = await runFailure(api.searchTitles("endless"), layer)
    expect(failure).toBeInstanceOf(CosenseApiError)
    expect(failure).toMatchObject({ status: 200 })
    expect(calls).toHaveLength(2)
  })

  it("x-following-id が前に辿った位置に戻っても、途中までを返さずに失敗する", async () => {
    const cursors = ["a", "b", "a"]
    let call = 0
    const { layer, calls } = testHttpClient(() => titlePage(10000, cursors[call++] ?? null))
    expect(await runFailure(api.searchTitles("cycle"), layer)).toBeInstanceOf(CosenseApiError)
    expect(calls).toHaveLength(3)
  })
})

describe("履歴", () => {
  it("pageSnapshots() は、id の無い項目を除いて返す", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({ timestamps: [{ id: "s1", created: 1 }, { created: 2 }] }),
    )
    expect(await run(api.pageSnapshots("myproject", "page1"), layer)).toEqual([
      { id: "s1", created: 1 },
    ])
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/page-snapshots/myproject/page1")
  })

  it("pageSnapshot() は、その時点のページを返す", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({ snapshot: { title: "My Page", created: 1, lines: [{ id: "l1", text: "My Page" }] } }),
    )
    const snapshot = await run(api.pageSnapshot("myproject", "page1", "s1"), layer)
    expect(snapshot.lines.map((line) => line.text)).toEqual(["My Page"])
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/page-snapshots/myproject/page1/s1")
  })
})

describe("失敗", () => {
  it("応答の本文の error を code に入れる", async () => {
    const { layer } = testHttpClient(() => json({ error: "SomeError" }, 403))
    expect(await runFailure(api.me(), layer)).toMatchObject({ status: 403, code: "SomeError" })
  })

  it("本文に error が無ければ、name を code に入れる", async () => {
    const { layer } = testHttpClient(() =>
      json({ name: "NotLoggedInError", message: "You are not logged in yet." }, 401),
    )
    expect(await runFailure(api.me(), layer)).toMatchObject({ code: "NotLoggedInError" })
  })

  it("本文に error と name の両方があれば、error を code に入れる", async () => {
    const { layer } = testHttpClient(() =>
      json({ error: "NotFastForward", name: "ConflictError" }, 409),
    )
    expect(await runFailure(api.me(), layer)).toMatchObject({ code: "NotFastForward" })
  })

  it("本文の message を、エラーの文に入れる", async () => {
    const { layer } = testHttpClient(() =>
      json({ name: "NotLoggedInError", message: "You are not logged in yet." }, 401),
    )
    const failure = await runFailure(api.me(), layer)
    expect(failure.message).toContain("You are not logged in yet.")
  })

  it("本文が JSON でなければ、その文をエラーの文に入れる", async () => {
    const { layer } = testHttpClient(
      () => new Response("request entity too large", { status: 400 }),
    )
    const failure = await runFailure(api.me(), layer)
    expect(failure.message).toContain("request entity too large")
  })

  it("本文が HTML なら、エラーの文に入れない", async () => {
    const { layer } = testHttpClient(
      () => new Response("<!DOCTYPE html><html><body>Bad Gateway</body></html>", { status: 502 }),
    )
    const failure = await runFailure(api.me(), layer)
    expect(failure.message).not.toContain("<")
  })

  it.each([
    [401, { name: "NotLoggedInError" }, "unauthorized"],
    [403, { name: "NotMemberError" }, "forbidden"],
    [404, { name: "NotFoundError" }, "notFound"],
    [409, { error: "NotFastForward" }, "notFastForward"],
    [409, { error: "DuplicateTitle" }, "duplicateTitle"],
    [413, {}, "tooLarge"],
    [422, {}, "invalidChanges"],
    [429, {}, "rateLimited"],
    [500, {}, "serverError"],
    [503, {}, "serverError"],
    [400, { error: "SomeError" }, "unknown"],
  ])("status %i、本文 %j なら kind は %s", async (status, body, kind) => {
    const { layer } = testHttpClient(() => json(body, status))
    expect(await runFailure(api.me(), layer)).toMatchObject({ kind })
  })

  it("本文が大きすぎて断られたら (400 request entity too large)、kind は tooLarge", async () => {
    const { layer } = testHttpClient(
      () => new Response("request entity too large", { status: 400 }),
    )
    expect(await runFailure(api.me(), layer)).toMatchObject({ status: 400, kind: "tooLarge" })
  })

  it("返ってきた JSON が読めなければ、code は DecodeError、kind は decode", async () => {
    const { layer } = testHttpClient(() => new Response("not json"))
    expect(await runFailure(api.me(), layer)).toMatchObject({
      status: 200,
      code: "DecodeError",
      kind: "decode",
    })
  })

  it("通信できなければ、status は 0、kind は network", async () => {
    const layer = Layer.succeed(
      HttpClient,
      HttpClient.of({
        fetch: () => Effect.fail(new HttpClientError({ cause: new Error("offline") })),
      }),
    )
    expect(await runFailure(api.me(), layer)).toMatchObject({ status: 0, kind: "network" })
  })

  it("エラーの文に PAT を出さない", async () => {
    const { layer } = testHttpClient(() => new Response("unauthorized", { status: 401 }))
    const failure = await runFailure(api.me(), layer)
    expect(String(failure)).not.toContain(PAT)
  })
})

describe("リダイレクト", () => {
  it("fetch には任せず (redirect: manual)、PAT を別のサイトへ送らない", async () => {
    const { layer, calls } = testHttpClient(() => json({ id: "u1" }))
    await run(api.me(), layer)
    expect(calls[0]?.init.redirect).toBe("manual")
  })

  it("同じ origin へのリダイレクトは、PAT を付けたまま辿る (名前を変えたページ)", async () => {
    const { layer, calls } = testHttpClient((url) =>
      url.includes("Old_Title")
        ? new Response(null, {
            status: 302,
            headers: { location: "/api/pages/v2/myproject/New_Title" },
          })
        : json({ id: "pg1", title: "New Title", persistent: true, lines: [] }),
    )
    const page = await run(api.getPage("myproject", "Old Title"), layer)
    expect(Option.isSome(page)).toBe(true)
    expect(calls[1]?.url).toBe("https://scrapbox.io/api/pages/v2/myproject/New_Title")
    expect(headersOf(calls[1])["x-personal-access-token"]).toBe(PAT)
  })

  it("別の origin へのリダイレクトは辿らずに失敗する", async () => {
    const { layer, calls } = testHttpClient(
      () =>
        new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }),
    )
    const failure = await runFailure(api.me(), layer)
    expect(failure).toMatchObject({ status: 302 })
    expect(calls).toHaveLength(1)
  })

  it("リダイレクトが続いても、3 回辿ったら諦める", async () => {
    const { layer, calls } = testHttpClient(
      () =>
        new Response(null, { status: 302, headers: { location: "/api/pages/v2/myproject/Round" } }),
    )
    const result = await Effect.runPromise(
      Effect.either(Effect.provide(api.getPage("myproject", "Round"), layer)),
    )
    expect(Either.isLeft(result)).toBe(true)
    expect(calls).toHaveLength(4)
  })
})

describe("書き込み", () => {
  it("previewEdit() と submitEdit() は、JSON を POST する", async () => {
    const { layer, calls } = testHttpClient((url) =>
      url.endsWith("/preview")
        ? json({ previewId: "pv1", expireAt: "later", pagePreview: null })
        : json({ commitId: "c1", page: { title: "My Page" } }),
    )
    const preview = await run(
      api.previewEdit("myproject", { changes: [{ _delete: "line1" }] }),
      layer,
    )
    const submit = await run(api.submitEdit("myproject", preview.previewId), layer)
    expect(submit.commitId).toBe("c1")
    expect(calls.map((call) => [call.url, call.init.method, call.init.body])).toEqual([
      [
        "https://scrapbox.io/api/pages/v2/myproject/page-edit-for-ai/preview",
        "POST",
        JSON.stringify({ changes: [{ _delete: "line1" }] }),
      ],
      [
        "https://scrapbox.io/api/pages/v2/myproject/page-edit-for-ai/submit",
        "POST",
        JSON.stringify({ previewId: "pv1" }),
      ],
    ])
    expect(headersOf(calls[0])["Content-Type"]).toBe("application/json")
  })

  it("previewEdit() は、ほかの人が先に書き換えたこと (409 NotFastForward) を code で知らせる", async () => {
    const { layer } = testHttpClient(() => json({ error: "NotFastForward", latest: null }, 409))
    expect(await runFailure(api.previewEdit("myproject", { changes: [] }), layer)).toMatchObject({
      status: 409,
      code: "NotFastForward",
    })
  })

  it("submitEdit() は、用意してから書くまでに同じタイトルのページができたこと (409 DuplicateTitle) を code で知らせる", async () => {
    const { layer } = testHttpClient(() => json({ error: "DuplicateTitle" }, 409))
    expect(await runFailure(api.submitEdit("myproject", "pv1"), layer)).toMatchObject({
      status: 409,
      code: "DuplicateTitle",
    })
  })

  it("replaceLinks() は、from と to をプロジェクトの置き換えに POST する", async () => {
    const { layer, calls } = testHttpClient(() =>
      json({ message: "3 pages have been successfully updated!" }),
    )
    const result = await run(api.replaceLinks("myproject", "old title", "new title"), layer)
    expect(result).toEqual({ message: "3 pages have been successfully updated!" })
    expect(calls[0]?.url).toBe("https://scrapbox.io/api/pages/myproject/replace/links")
    expect(calls[0]?.init.body).toBe(JSON.stringify({ from: "old title", to: "new title" }))
  })
})

describe("markAccessed", () => {
  it("開いたことを POST で記録する", async () => {
    const { layer, calls } = testHttpClient(() => json({}))
    await run(api.markAccessed("myproject", "page1"), layer)
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ["https://scrapbox.io/api/pages/myproject/page1/accessed", "POST"],
    ])
  })

  it("POST を断られたら GET で記録する", async () => {
    const { layer, calls } = testHttpClient((_url, init) =>
      init.method === "POST" ? json({}, 405) : json({}),
    )
    await run(api.markAccessed("myproject", "page1"), layer)
    expect(calls.map((call) => call.init.method)).toEqual(["POST", "GET"])
  })

  it("記録できなくても失敗しない", async () => {
    const { layer } = testHttpClient(() => json({}, 404))
    expect(await run(api.markAccessed("myproject", "page1"), layer)).toBeUndefined()
  })
})

/** preview / submit / ページの取得に、それぞれ順に答える。呼ばれた順と本文を記録する。 */
const server = (responses: {
  readonly preview?: Response[]
  readonly submit?: Response[]
  readonly page?: Response[]
}) => {
  const queues = {
    preview: [...(responses.preview ?? [])],
    submit: [...(responses.submit ?? [])],
    page: [...(responses.page ?? [])],
  }
  const client = testHttpClient((url) => {
    const key = url.endsWith("/preview") ? "preview" : url.endsWith("/submit") ? "submit" : "page"
    return queues[key].shift() ?? new Response("unexpected", { status: 599 })
  })
  const steps = () =>
    client.calls.map((call) =>
      call.url.endsWith("/preview") ? "preview" : call.url.endsWith("/submit") ? "submit" : "page",
    )
  const previewBodies = () =>
    client.calls
      .filter((call) => call.url.endsWith("/preview"))
      .map((call) => JSON.parse(String(call.init.body)) as unknown)
  return { ...client, steps, previewBodies }
}

describe("updatePage", () => {
  const BASE = {
    id: "page1",
    title: "Title",
    commitId: "c0",
    lines: [
      { id: "l1", text: "Title" },
      { id: "l2", text: "alpha" },
      { id: "l3", text: "beta" },
    ],
  }

  /** 今のページ (getPage の応答)。 */
  const latest = (commitId: string, lines: { id: string; text: string }[]) =>
    json({ id: "page1", title: "Title", commitId, persistent: true, lines })

  const previewOn = (commitId: string) =>
    json({ previewId: `preview-${commitId}`, expireAt: "later", pagePreview: { commitId } })

  it("何も変えていなければ、何も送らない", async () => {
    const { layer, calls } = server({})
    const result = await run(api.updatePage("myproject", BASE, ["Title", "alpha", "beta"]), layer)
    expect(result).toEqual({ commitId: "c0", lines: ["Title", "alpha", "beta"], overwritten: [] })
    expect(calls).toHaveLength(0)
  })

  it("読んだときのままのページには、そのまま書く", async () => {
    const { layer, steps, previewBodies } = server({
      preview: [previewOn("c0")],
      submit: [json({ commitId: "c1" })],
    })
    const result = await run(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer)
    expect(result.commitId).toBe("c1")
    expect(steps()).toEqual(["preview", "submit"])
    expect(previewBodies()).toEqual([
      { pageId: "page1", changes: [{ _update: "l2", lines: { text: "ALPHA" } }] },
    ])
  })

  it("ほかの人が別の行を書き換えていたら、合わせて書く", async () => {
    const { layer, steps, previewBodies } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [
        latest("c1", [
          { id: "l1", text: "Title" },
          { id: "l2", text: "alpha" },
          { id: "l3", text: "BETA" },
        ]),
      ],
      submit: [json({ commitId: "c2" })],
    })
    const result = await run(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer)
    expect(result).toEqual({ commitId: "c2", lines: ["Title", "ALPHA", "BETA"], overwritten: [] })
    expect(steps()).toEqual(["preview", "page", "preview", "submit"])
    expect(previewBodies()[1]).toEqual({
      pageId: "page1",
      changes: [{ _update: "l2", lines: { text: "ALPHA" } }],
    })
  })

  it("読み直すときは、読んだときのタイトルで引く (名前を変えられていても今のページが返る)", async () => {
    const { layer, calls } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [latest("c1", BASE.lines)],
      submit: [json({ commitId: "c2" })],
    })
    await run(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer)
    expect(calls.map((call) => call.url)).toContain(
      "https://scrapbox.io/api/pages/v2/myproject/Title/?followRename=true",
    )
  })

  const theirsOnAlpha = () =>
    latest("c1", [
      { id: "l1", text: "Title" },
      { id: "l2", text: "theirs" },
      { id: "l3", text: "beta" },
    ])

  it("ほかの人が同じ行を書き換えていたら、既定では何も書かずに PageConflictError で止める", async () => {
    const { layer, steps } = server({ preview: [previewOn("c1")], page: [theirsOnAlpha()] })
    const failure = await Effect.runPromise(
      Effect.flip(
        Effect.provide(api.updatePage("myproject", BASE, ["Title", "ours", "beta"]), layer),
      ),
    )
    expect(failure).toBeInstanceOf(PageConflictError)
    expect(failure).toMatchObject({
      conflicts: [{ line: 1, ours: "ours", theirs: "theirs", base: "alpha" }],
    })
    expect(steps()).toEqual(["preview", "page"])
  })

  it("PageConflictError には、合わせた先の今のページ (commitId と行の id) を入れる", async () => {
    const { layer } = server({ preview: [previewOn("c1")], page: [theirsOnAlpha()] })
    const failure = await runFailure(
      api.updatePage("myproject", BASE, ["Title", "ours", "beta"]),
      layer,
    )
    expect(failure).toMatchObject({
      latest: {
        commitId: "c1",
        lines: [
          { id: "l1", text: "Title" },
          { id: "l2", text: "theirs" },
          { id: "l3", text: "beta" },
        ],
      },
    })
  })

  it("PageConflictError の latest を元にすれば、自分で解いた文で書き直せる", async () => {
    const { layer, previewBodies } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [theirsOnAlpha()],
      submit: [json({ commitId: "c2" })],
    })
    const failure = await runFailure(
      api.updatePage("myproject", BASE, ["Title", "ours", "beta"]),
      layer,
    )
    if (!(failure instanceof PageConflictError)) throw failure
    const result = await run(
      api.updatePage("myproject", failure.latest, ["Title", "ours and theirs", "beta"]),
      layer,
    )
    expect(result.commitId).toBe("c2")
    expect(previewBodies()[1]).toEqual({
      pageId: "page1",
      changes: [{ _update: "l2", lines: { text: "ours and theirs" } }],
    })
  })

  it("1 行目を変えてタイトルが変わったら、titleChanged で知らせる", async () => {
    const { layer } = server({
      preview: [previewOn("c0")],
      submit: [
        json({
          commitId: "c1",
          page: { title: "New title" },
          titleChanged: { from: "Title", to: "New title" },
        }),
      ],
    })
    const result = await run(
      api.updatePage("myproject", BASE, ["New title", "alpha", "beta"]),
      layer,
    )
    expect(result.titleChanged).toEqual({ from: "Title", to: "New title" })
  })

  it("同じタイトルのページがあって Cosense がタイトルを変えて書いたら、結果の 1 行目もそのタイトルにする", async () => {
    const { layer } = server({
      preview: [previewOn("c0")],
      submit: [
        json({
          commitId: "c1",
          page: { title: "Other_1" },
          titleChanged: { from: "Title", to: "Other_1" },
        }),
      ],
    })
    const result = await run(api.updatePage("myproject", BASE, ["Other", "alpha", "beta"]), layer)
    expect(result.lines).toEqual(["Other_1", "alpha", "beta"])
  })

  it("titleChanged に変えた後のタイトルが無ければ、結果の 1 行目は送った文のままにする", async () => {
    const { layer } = server({
      preview: [previewOn("c0")],
      submit: [json({ commitId: "c1", titleChanged: { from: "Title" } })],
    })
    const result = await run(api.updatePage("myproject", BASE, ["Other", "alpha", "beta"]), layer)
    expect(result.lines).toEqual(["Other", "alpha", "beta"])
  })

  it('whenConflict: "overwrite" なら、同じ行は自分の文で上書きする', async () => {
    const { layer, previewBodies } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [theirsOnAlpha()],
      submit: [json({ commitId: "c2" })],
    })
    const result = await run(
      api.updatePage("myproject", BASE, ["Title", "ours", "beta"], { whenConflict: "overwrite" }),
      layer,
    )
    expect(result).toEqual({
      commitId: "c2",
      lines: ["Title", "ours", "beta"],
      overwritten: [{ line: 1, ours: "ours", theirs: "theirs", base: "alpha" }],
    })
    expect(previewBodies()[1]).toMatchObject({
      changes: [{ _update: "l2", lines: { text: "ours" } }],
    })
  })

  it('whenConflict: "overwrite" なら、自分が消した行は、ほかの人が書き換えていても消す', async () => {
    const { layer, previewBodies } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [theirsOnAlpha()],
      submit: [json({ commitId: "c2" })],
    })
    const result = await run(
      api.updatePage("myproject", BASE, ["Title", "beta"], { whenConflict: "overwrite" }),
      layer,
    )
    expect(result.lines).toEqual(["Title", "beta"])
    expect(previewBodies()[1]).toMatchObject({ changes: [{ _delete: "l2" }] })
  })

  it("もう無い行を指して断られたら (422)、今のページに合わせて書き直す", async () => {
    const { layer, steps } = server({
      preview: [json({}, 422), previewOn("c1")],
      page: [
        latest("c1", [
          { id: "l1", text: "Title" },
          { id: "l2", text: "alpha" },
        ]),
      ],
      submit: [json({ commitId: "c2" })],
    })
    const result = await run(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer)
    expect(result.lines).toEqual(["Title", "ALPHA"])
    expect(steps()).toEqual(["preview", "page", "preview", "submit"])
  })

  it("書く直前にほかの人が書いて断られたら (409 NotFastForward)、読み直して合わせる", async () => {
    const { layer, steps } = server({
      preview: [previewOn("c0"), previewOn("c1")],
      submit: [json({ error: "NotFastForward" }, 409), json({ commitId: "c2" })],
      page: [
        latest("c1", [
          { id: "l1", text: "Title" },
          { id: "l2", text: "alpha" },
          { id: "l3", text: "BETA" },
        ]),
      ],
    })
    const result = await run(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer)
    expect(result).toMatchObject({ commitId: "c2", lines: ["Title", "ALPHA", "BETA"] })
    expect(steps()).toEqual(["preview", "submit", "page", "preview", "submit"])
  })

  it("ページが動いていないのに断られたら、そのエラーで失敗する", async () => {
    const { layer } = server({
      preview: [json({}, 422)],
      page: [latest("c0", BASE.lines)],
    })
    expect(
      await runFailure(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer),
    ).toMatchObject({ status: 422 })
  })

  it("ページが消えていたら、404 で失敗する", async () => {
    const { layer } = server({
      preview: [previewOn("c1")],
      page: [new Response("not found", { status: 404 })],
    })
    expect(
      await runFailure(api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]), layer),
    ).toMatchObject({ status: 404 })
  })

  it("ほかの人の書き換えが続いたら、3 回書こうとして諦める (409 NotFastForward)", async () => {
    const { layer, steps } = server({
      preview: [previewOn("c1"), previewOn("c2"), previewOn("c3")],
      page: [latest("c1", BASE.lines), latest("c2", BASE.lines), latest("c3", BASE.lines)],
    })
    const failure = await runFailure(
      api.updatePage("myproject", BASE, ["Title", "ALPHA", "beta"]),
      layer,
    )
    expect(failure).toMatchObject({ status: 409, code: "NotFastForward", kind: "notFastForward" })
    expect(steps().filter((step) => step === "preview")).toHaveLength(3)
  })
})

describe("createPage", () => {
  const notFound = () => json({ error: "NotFound" }, 404)

  /** もうあるページ (getPage の応答)。 */
  const existing = (title: string) =>
    json({
      id: "page9",
      title,
      commitId: "c5",
      persistent: true,
      lines: [{ id: "l1", text: title }],
    })

  const preview = () => json({ previewId: "p1", expireAt: "later", pagePreview: null })

  it("無いタイトルなら、pageId を付けずに用意して書き、作ったタイトルを返す", async () => {
    const { layer, steps, previewBodies } = server({
      page: [notFound()],
      preview: [preview()],
      submit: [json({ commitId: "c1", page: { title: "New page" } })],
    })
    const result = await run(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(result).toEqual({ commitId: "c1", title: "New page" })
    expect(steps()).toEqual(["page", "preview", "submit"])
    expect(previewBodies()).toEqual([
      {
        changes: [
          { _insert: "_end", lines: { id: expect.any(String), text: "New page" } },
          { _insert: "_end", lines: { id: expect.any(String), text: "本文" } },
        ],
      },
    ])
  })

  it("同じタイトルのページがあれば、何も書かずに PageExistsError で止め、そのページを渡す", async () => {
    const { layer, steps } = server({ page: [existing("New page")] })
    const failure = await runFailure(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(failure).toBeInstanceOf(PageExistsError)
    expect(failure).toMatchObject({ page: { id: "page9", commitId: "c5" } })
    expect(steps()).toEqual(["page"])
  })

  it("大文字と小文字、空白と _ だけが違うタイトルも、同じページとして止める", async () => {
    const { layer } = server({ page: [existing("New page")] })
    const failure = await runFailure(api.createPage("myproject", ["new_PAGE", "本文"]), layer)
    expect(failure).toBeInstanceOf(PageExistsError)
  })

  it("名前を変えたページの古いタイトルなら、そのページとは別に作る", async () => {
    const { layer, steps } = server({
      page: [existing("Renamed")],
      preview: [preview()],
      submit: [json({ commitId: "c1", page: { title: "Old name" } })],
    })
    const result = await run(api.createPage("myproject", ["Old name", "本文"]), layer)
    expect(result.title).toBe("Old name")
    expect(steps()).toEqual(["page", "preview", "submit"])
  })

  it("Cosense がタイトルに番号を付けて作ったら、そのタイトルを返す", async () => {
    const { layer } = server({
      page: [notFound()],
      preview: [preview()],
      submit: [json({ commitId: "c1", page: { title: "New page_1" } })],
    })
    const result = await run(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(result.title).toBe("New page_1")
  })

  it("書いた結果にタイトルが無ければ、1 行目をタイトルとして返す", async () => {
    const { layer } = server({
      page: [notFound()],
      preview: [preview()],
      submit: [json({ commitId: "c1" })],
    })
    const result = await run(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(result.title).toBe("New page")
  })

  it("書いた結果の page にタイトルが無くても、1 行目をタイトルとして返す", async () => {
    const { layer } = server({
      page: [notFound()],
      preview: [preview()],
      submit: [json({ commitId: "c1", page: {} })],
    })
    const result = await run(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(result.title).toBe("New page")
  })

  it("用意してから書くまでに、ほかの人が同じタイトルで作ったら (409 DuplicateTitle)、PageExistsError で止める", async () => {
    const { layer, steps } = server({
      page: [notFound(), existing("New page")],
      preview: [preview()],
      submit: [json({ error: "DuplicateTitle" }, 409)],
    })
    const failure = await runFailure(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(failure).toBeInstanceOf(PageExistsError)
    expect(steps()).toEqual(["page", "preview", "submit", "page"])
  })

  it("409 DuplicateTitle の後に読み直しても同じタイトルのページが無ければ、そのエラーで止める", async () => {
    const { layer } = server({
      page: [notFound(), notFound()],
      preview: [preview()],
      submit: [json({ error: "DuplicateTitle" }, 409)],
    })
    const failure = await runFailure(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(failure).toMatchObject({ status: 409, code: "DuplicateTitle" })
  })

  it("ほかの理由で断られたら、読み直さずにそのエラーで止める", async () => {
    const { layer, steps } = server({
      page: [notFound()],
      preview: [preview()],
      submit: [json({ error: "Forbidden" }, 403)],
    })
    const failure = await runFailure(api.createPage("myproject", ["New page", "本文"]), layer)
    expect(failure).toMatchObject({ status: 403 })
    expect(steps()).toEqual(["page", "preview", "submit"])
  })
})

describe("fetchAsset", () => {
  const FILE = "https://scrapbox.io/files/abc.png"
  const SIGNED = "https://storage.googleapis.com/bucket/abc?X-Goog-Expires=300"

  /** URL ごとに応答を決める。表に無い URL は 404。 */
  const routes = (table: Record<string, () => Response>) =>
    testHttpClient((url) => table[url]?.() ?? new Response("not found", { status: 404 }))

  it("リダイレクトを辿って、中身と Content-Type を返す", async () => {
    const { layer } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: SIGNED } }),
      [SIGNED]: () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    })
    const asset = await run(api.fetchAsset(FILE), layer)
    expect([...asset.data]).toEqual([1, 2, 3])
    expect(asset.contentType).toBe("image/png")
  })

  it("PAT は origin にだけ送り、リダイレクト先には送らない", async () => {
    const { layer, calls } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: SIGNED } }),
      [SIGNED]: () => new Response("x", { headers: { "content-type": "image/png" } }),
    })
    await run(api.fetchAsset(FILE), layer)
    expect(calls.map((call) => [call.url, headersOf(call)["x-personal-access-token"]])).toEqual([
      [FILE, PAT],
      [SIGNED, undefined],
    ])
  })

  it("リダイレクトは fetch に任せず (redirect: manual)、自分で辿る", async () => {
    const { layer, calls } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: SIGNED } }),
      [SIGNED]: () => new Response("x"),
    })
    await run(api.fetchAsset(FILE), layer)
    expect(calls.map((call) => call.init.redirect)).toEqual(["manual", "manual"])
  })

  it("相対パスのリダイレクト先も辿る", async () => {
    const { layer } = routes({
      "https://scrapbox.io/api/pages/p/u/icon": () =>
        new Response(null, { status: 302, headers: { location: "/files/abc.png" } }),
      [FILE]: () => new Response("x", { headers: { "content-type": "image/png" } }),
    })
    const asset = await run(api.fetchAsset("https://scrapbox.io/api/pages/p/u/icon"), layer)
    expect(asset.contentType).toBe("image/png")
  })

  it("2xx 以外なら、その status で失敗する", async () => {
    const { layer } = routes({})
    expect(
      await runFailure(api.fetchAsset("https://scrapbox.io/files/none.png"), layer),
    ).toMatchObject({ status: 404 })
  })

  it("リダイレクトが 5 回を超えたら、辿るのをやめて失敗する", async () => {
    const { layer, calls } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: FILE } }),
    })
    expect(await runFailure(api.fetchAsset(FILE), layer)).toMatchObject({ status: 302 })
    expect(calls).toHaveLength(6)
  })

  it("http の URL も取る", async () => {
    const { layer } = routes({
      "http://example.com/a.png": () =>
        new Response("x", { headers: { "content-type": "image/png" } }),
    })
    const asset = await run(api.fetchAsset("http://example.com/a.png"), layer)
    expect(asset.contentType).toBe("image/png")
  })

  it("http(s) でない URL は、取りに行かずに invalidUrl で失敗する", async () => {
    const { layer, calls } = routes({})
    expect(await runFailure(api.fetchAsset("file:///etc/hosts"), layer)).toMatchObject({
      kind: "invalidUrl",
      status: 0,
    })
    expect(calls).toHaveLength(0)
  })

  it("URL として読めない文字列も、invalidUrl で失敗する", async () => {
    const { layer } = routes({})
    expect(await runFailure(api.fetchAsset("not a url"), layer)).toMatchObject({
      kind: "invalidUrl",
      status: 0,
    })
  })

  it("リダイレクト先が http(s) でなければ、辿らずに invalidUrl で失敗する", async () => {
    const { layer, calls } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: "file:///etc/hosts" } }),
    })
    expect(await runFailure(api.fetchAsset(FILE), layer)).toMatchObject({
      kind: "invalidUrl",
      status: 302,
    })
    expect(calls.map((call) => call.url)).toEqual([FILE])
  })

  it("リダイレクト先が URL として読めなくても、invalidUrl で失敗する", async () => {
    const { layer } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: "https://[" } }),
    })
    expect(await runFailure(api.fetchAsset(FILE), layer)).toMatchObject({
      kind: "invalidUrl",
      status: 302,
    })
  })
})
