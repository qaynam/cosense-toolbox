import { Effect, Either, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"

import { createCosenseApi } from "./api"
import { PageConflictError } from "./errors"
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

  it("submitEdit() は、同じタイトルのページがあること (409 DuplicateTitle) を code で知らせる", async () => {
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
        call.url.endsWith("/preview")
          ? "preview"
          : call.url.endsWith("/submit")
            ? "submit"
            : "page",
      )
    const previewBodies = () =>
      client.calls
        .filter((call) => call.url.endsWith("/preview"))
        .map((call) => JSON.parse(String(call.init.body)) as unknown)
    return { ...client, steps, previewBodies }
  }

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

  it('onConflict: "overwrite" なら、同じ行は自分の文で上書きする', async () => {
    const { layer, previewBodies } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [theirsOnAlpha()],
      submit: [json({ commitId: "c2" })],
    })
    const result = await run(
      api.updatePage("myproject", BASE, ["Title", "ours", "beta"], { onConflict: "overwrite" }),
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

  it('onConflict: "overwrite" なら、自分が消した行は、ほかの人が書き換えていても消す', async () => {
    const { layer, previewBodies } = server({
      preview: [previewOn("c1"), previewOn("c1")],
      page: [theirsOnAlpha()],
      submit: [json({ commitId: "c2" })],
    })
    const result = await run(
      api.updatePage("myproject", BASE, ["Title", "beta"], { onConflict: "overwrite" }),
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
    expect(failure).toMatchObject({ status: 409, code: "NotFastForward" })
    expect(steps().filter((step) => step === "preview")).toHaveLength(3)
  })
})
