import { describe, expect, it } from "vitest"

import { cosenseIconUrl, fetchAsset, fetchPage, fetchPageText, isCosenseAssetUrl } from "./fetch"

const TEXT = "タイトル\n本文\n 二行目"

/** 呼ばれた URL を記録し、決まった応答を返す fetch。 */
const fakeFetch = (response: () => Response) => {
  const calls: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    return response()
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

describe("fetchPageText", () => {
  it("/text の本文をそのまま返し、プロジェクト名とタイトルを URL エンコードする", async () => {
    const { calls, fetch } = fakeFetch(() => new Response(TEXT))
    expect(await fetchPageText("my project", "a/b c", { fetch })).toBe(TEXT)
    expect(calls).toEqual(["https://scrapbox.io/api/pages/my%20project/a%2Fb%20c/text"])
  })

  it("2xx 以外ならステータスを含めてエラーにする", async () => {
    const { fetch } = fakeFetch(() => new Response("not found", { status: 404 }))
    await expect(fetchPageText("p", "t", { fetch })).rejects.toThrow(/404/)
  })
})

describe("fetchPage", () => {
  it("JSON の lines をつないだ本文が /text と一致し、日時を ISO 8601 にする", async () => {
    const body = {
      title: "タイトル",
      created: 1_700_000_000,
      updated: 1_700_000_060,
      lines: TEXT.split("\n").map((text) => ({ text })),
    }
    const { calls, fetch } = fakeFetch(() => Response.json(body))
    expect(await fetchPage("p", "タイトル", { fetch })).toEqual({
      title: "タイトル",
      text: TEXT,
      created: "2023-11-14T22:13:20.000Z",
      updated: "2023-11-14T22:14:20.000Z",
    })
    expect(calls).toEqual(["https://scrapbox.io/api/pages/p/%E3%82%BF%E3%82%A4%E3%83%88%E3%83%AB"])
  })
})

describe("isCosenseAssetUrl", () => {
  it("Cosense にアップロードしたファイルとアイコンの API は Cosense 上のファイル", () => {
    expect(isCosenseAssetUrl("https://scrapbox.io/files/665f0b8c962ee6001c15c172.png")).toBe(true)
    expect(isCosenseAssetUrl("https://scrapbox.io/api/pages/help-jp/cosense/icon")).toBe(true)
  })

  it("ページや外部の画像は対象にしない", () => {
    expect(isCosenseAssetUrl("https://scrapbox.io/help-jp/page")).toBe(false)
    expect(isCosenseAssetUrl("https://gyazo.com/abc/max_size/1000")).toBe(false)
    expect(isCosenseAssetUrl("/files/abc.png")).toBe(false)
  })
})

describe("cosenseIconUrl", () => {
  it("プロジェクト名とユーザー名からアイコンの API の URL を作る", () => {
    expect(cosenseIconUrl("my project", "a b")).toBe(
      "https://scrapbox.io/api/pages/my%20project/a%20b/icon",
    )
  })

  it("[/project/name.icon] のように別プロジェクトを指すときは、そのプロジェクトのページにする", () => {
    expect(cosenseIconUrl("mine", "/icons/炎上")).toBe(
      "https://scrapbox.io/api/pages/icons/%E7%82%8E%E4%B8%8A/icon",
    )
  })
})

describe("fetchAsset", () => {
  /** URL ごとに応答を決める fetch。受け取った URL とヘッダを記録する。 */
  const routes = (table: Record<string, () => Response>) => {
    const calls: { url: string; pat: string | null; redirect: string | undefined }[] = []
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({
        url,
        pat: new Headers(init?.headers).get("x-personal-access-token"),
        redirect: init?.redirect,
      })
      const route = table[url]
      return route === undefined ? new Response("not found", { status: 404 }) : route()
    }) as typeof globalThis.fetch
    return { calls, fetch }
  }

  const FILE = "https://scrapbox.io/files/abc.png"
  const SIGNED = "https://storage.googleapis.com/bucket/abc?X-Goog-Expires=300"

  it("リダイレクトを辿って中身と Content-Type を返す", async () => {
    const { fetch } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: SIGNED } }),
      [SIGNED]: () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    })
    const asset = await fetchAsset(FILE, { fetch })
    expect([...asset.data]).toEqual([1, 2, 3])
    expect(asset.contentType).toBe("image/png")
  })

  it("PAT は Cosense にだけ送り、リダイレクト先には送らない", async () => {
    const { calls, fetch } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: SIGNED } }),
      [SIGNED]: () => new Response("x", { headers: { "content-type": "image/png" } }),
    })
    await fetchAsset(FILE, { fetch, pat: "secret" })
    expect(calls.map(({ url, pat }) => [url, pat])).toEqual([
      [FILE, "secret"],
      [SIGNED, null],
    ])
    // fetch に任せると独自ヘッダを付けたまま別のオリジンへ辿るので、自分で辿る。
    expect(calls.every(({ redirect }) => redirect === "manual")).toBe(true)
  })

  it("相対パスのリダイレクト先も辿る", async () => {
    const { fetch } = routes({
      "https://scrapbox.io/api/pages/p/u/icon": () =>
        new Response(null, { status: 302, headers: { location: "/files/abc.png" } }),
      [FILE]: () => new Response("x", { headers: { "content-type": "image/png" } }),
    })
    expect(
      (await fetchAsset("https://scrapbox.io/api/pages/p/u/icon", { fetch })).contentType,
    ).toBe("image/png")
  })

  it("2xx 以外や、リダイレクトが続きすぎるときはエラーにする", async () => {
    const { fetch } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: FILE } }),
    })
    await expect(fetchAsset(FILE, { fetch })).rejects.toThrow(/リダイレクト/)
    await expect(fetchAsset("https://scrapbox.io/files/none.png", routes({}))).rejects.toThrow(
      /404/,
    )
  })
})
