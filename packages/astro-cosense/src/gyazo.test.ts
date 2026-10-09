import type { Element, Root } from "hast"
import { describe, expect, it } from "vitest"

import { type GyazoVideoOptions, rehypeGyazoVideos } from "./gyazo"

const HASH = "073801537a363a1768d00486ae1c9f17"
const OEMBED = `https://api.gyazo.com/api/oembed?url=${encodeURIComponent(`https://gyazo.com/${HASH}`)}`

const oembed = (type: "photo" | "video") => () => Response.json({ version: "1.0", type })

/** URL ごとに応答を決める fetch。呼ばれた URL を記録する。 */
const routes = (table: Record<string, () => Response>) => {
  const calls: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    const route = table[String(input)]
    return route === undefined ? new Response("not found", { status: 404 }) : route()
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

const img = (src: string, properties: Record<string, unknown> = {}): Element => ({
  type: "element",
  tagName: "img",
  properties: { className: ["image"], src, alt: "", ...properties },
  children: [],
})

const run = async (
  table: Record<string, () => Response>,
  children: Element[],
  options: Partial<Pick<GyazoVideoOptions, "as">> & { warnings?: string[] } = {},
) => {
  const { calls, fetch } = routes(table)
  const tree: Root = { type: "root", children }
  const transform = rehypeGyazoVideos({
    as: options.as ?? "video",
    classNames: { video: "video", embed: "embed" },
    fetch,
    warn: (message) => options.warnings?.push(message),
  })()
  await transform(tree)
  return { calls, tree }
}

describe("rehypeGyazoVideos", () => {
  it("oEmbed で動画と分かった Gyazo の画像は、as: 'video' なら mp4 の <video> にする", async () => {
    const { tree } = await run({ [OEMBED]: oembed("video") }, [
      img(`https://gyazo.com/${HASH}/raw`),
    ])
    expect(tree.children[0]).toMatchObject({
      tagName: "video",
      properties: {
        className: ["video"],
        src: `https://i.gyazo.com/${HASH}.mp4`,
        controls: true,
        loop: true,
      },
    })
  })

  it("as: 'iframe' なら、Gyazo のプレーヤーの <iframe> にする", async () => {
    const { tree } = await run(
      { [OEMBED]: oembed("video") },
      [img(`https://gyazo.com/${HASH}/raw`)],
      {
        as: "iframe",
      },
    )
    expect(tree.children[0]).toMatchObject({
      tagName: "iframe",
      properties: { className: ["embed"], src: `https://gyazo.com/player/${HASH}` },
    })
  })

  it("[[ ]] の大きい表示は、動画にしても引き継ぐ", async () => {
    const { tree } = await run({ [OEMBED]: oembed("video") }, [
      img(`https://gyazo.com/${HASH}/raw`, { dataLarge: "true" }),
    ])
    expect(tree.children[0]).toMatchObject({ tagName: "video", properties: { dataLarge: "true" } })
  })

  it("oEmbed で画像と分かったものは、<img> のまま残す", async () => {
    const original = img(`https://gyazo.com/${HASH}/raw`)
    const { tree } = await run({ [OEMBED]: oembed("photo") }, [structuredClone(original)])
    expect(tree.children[0]).toEqual(original)
  })

  it("拡張子付きの Gyazo の画像は、書いた人が形を決めているので oEmbed に聞かない", async () => {
    const { calls } = await run({}, [img(`https://i.gyazo.com/${HASH}.gif`)])
    expect(calls).toEqual([])
  })

  it("同じ hash は、何度出てきても oEmbed に一度だけ聞く", async () => {
    const { calls } = await run({ [OEMBED]: oembed("video") }, [
      img(`https://gyazo.com/${HASH}/raw`),
      img(`https://gyazo.com/${HASH}/raw`),
    ])
    expect(calls).toEqual([OEMBED])
  })

  it("oEmbed に聞けなかったら、<img> のまま残して知らせる", async () => {
    const warnings: string[] = []
    const original = img(`https://gyazo.com/${HASH}/raw`)
    const { tree } = await run({}, [structuredClone(original)], { warnings })
    expect(tree.children[0]).toEqual(original)
    expect(warnings).toEqual([expect.stringContaining(HASH)])
  })
})
