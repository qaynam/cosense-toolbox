import { describe, expect, it } from "vitest"

import { cosenseIconUrl, isCosenseAssetUrl } from "./assets"

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
