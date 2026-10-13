import { describe, expect, it } from "vitest"

import { cosenseIconUrl, fetchAsset, isCosenseAssetUrl } from "./assets"
import { CosenseApiError } from "./errors"

describe("isCosenseAssetUrl", () => {
  it("Cosense にアップロードしたファイルとアイコンの API は Cosense 上のファイル", () => {
    expect(isCosenseAssetUrl("https://scrapbox.io/files/0123456789abcdef01234567.png")).toBe(true)
    expect(isCosenseAssetUrl("https://scrapbox.io/api/pages/help-jp/cosense/icon")).toBe(true)
  })

  it("ページや外部の画像は対象にしない", () => {
    expect(isCosenseAssetUrl("https://scrapbox.io/help-jp/page")).toBe(false)
    expect(isCosenseAssetUrl("https://gyazo.com/abc/max_size/1000")).toBe(false)
    expect(isCosenseAssetUrl("/files/abc.png")).toBe(false)
  })

  it("アイコン以外の API (ページの JSON など) は対象にしない", () => {
    expect(isCosenseAssetUrl("https://scrapbox.io/api/pages/help-jp/page")).toBe(false)
  })

  it("origin を渡すと、その origin のファイルを対象にする", () => {
    expect(
      isCosenseAssetUrl("https://cosense.example/files/abc.png", {
        origin: "https://cosense.example",
      }),
    ).toBe(true)
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
    await fetchAsset(FILE, { fetch, pat: "dummy-secret-pat" })
    expect(calls.map(({ url, pat }) => [url, pat])).toEqual([
      [FILE, "dummy-secret-pat"],
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

  it("2xx 以外なら、その status の CosenseApiError で reject する", async () => {
    const failure = await fetchAsset("https://scrapbox.io/files/none.png", routes({})).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(CosenseApiError)
    expect(failure).toMatchObject({ status: 404 })
  })

  it("リダイレクトが 5 回を超えたら、辿るのをやめて reject する", async () => {
    const { calls, fetch } = routes({
      [FILE]: () => new Response(null, { status: 302, headers: { location: FILE } }),
    })
    await expect(fetchAsset(FILE, { fetch })).rejects.toBeInstanceOf(CosenseApiError)
    expect(calls).toHaveLength(6)
  })
})
