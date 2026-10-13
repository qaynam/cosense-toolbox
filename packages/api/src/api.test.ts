import { Effect, Either, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"

import { createCosenseApi } from "./api"
import type { CosenseApiError } from "./errors"
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

const run = <A>(
  effect: Effect.Effect<A, CosenseApiError, HttpClient>,
  layer: Layer.Layer<HttpClient>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, layer))

const runFailure = <A>(
  effect: Effect.Effect<A, CosenseApiError, HttpClient>,
  layer: Layer.Layer<HttpClient>,
): Promise<CosenseApiError> => Effect.runPromise(Effect.flip(Effect.provide(effect, layer)))

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
      }),
    )
    expect(calls[0]?.url).toBe(
      "https://scrapbox.io/api/pages/v2/myproject/My_Page/?followRename=true",
    )
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

  it("10000 件に届かなければ、x-following-id があっても終わりとみなす", async () => {
    const { layer, calls } = testHttpClient(() => titlePage(12, "next"))
    await run(api.searchTitles("small"), layer)
    expect(calls).toHaveLength(1)
  })

  it("続きがあると言い続けるサーバーでも、20 回で止まる", async () => {
    const { layer, calls } = testHttpClient(() => titlePage(10000, "again"))
    const titles = await run(api.searchTitles("endless"), layer)
    expect(calls).toHaveLength(20)
    expect(titles).toHaveLength(200000)
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

  it("返ってきた JSON が読めなければ code は DecodeError", async () => {
    const { layer } = testHttpClient(() => new Response("not json"))
    expect(await runFailure(api.me(), layer)).toMatchObject({ status: 200, code: "DecodeError" })
  })

  it("通信できなければ status は 0", async () => {
    const layer = Layer.succeed(
      HttpClient,
      HttpClient.of({
        fetch: () => Effect.fail(new HttpClientError({ cause: new Error("offline") })),
      }),
    )
    expect(await runFailure(api.me(), layer)).toMatchObject({ status: 0 })
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
