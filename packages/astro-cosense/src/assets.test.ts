import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { createAssetStore, rehypeCosenseAssets } from './assets'

const FILE = 'https://scrapbox.io/files/abc.png'
const ICON = 'https://scrapbox.io/api/pages/p/user/icon'

/** URL ごとに応答を決める fetch。呼ばれた URL を記録する。 */
const routes = (table: Record<string, () => Response>) => {
  const calls: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    const route = table[String(input)]
    return route === undefined ? new Response('not found', { status: 404 }) : route()
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

const png = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })

const store = async (table: Record<string, () => Response>, warnings: string[] = []) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'cosense-assets-'))
  const { calls, fetch } = routes(table)
  return {
    calls,
    cacheDir,
    store: createAssetStore({
      cacheDir,
      publicPath: '/_cosense/',
      fetchOptions: { fetch },
      warn: (message) => warnings.push(message),
    }),
  }
}

describe('createAssetStore', () => {
  it('Cosense 上のファイルを取ってきて置き、サイトの中の URL を返す', async () => {
    const { cacheDir, store: assets } = await store({ [FILE]: png })
    const url = await assets.resolve(FILE)
    expect(url).toMatch(/^\/_cosense\/[0-9a-f]{16}\.png$/)
    const [name] = await readdir(cacheDir)
    expect(`/_cosense/${name}`).toBe(url)
    expect([...(await readFile(join(cacheDir, name as string)))]).toEqual([137, 80, 78, 71])
  })

  it('同じ URL は 1 回しか取りに行かない', async () => {
    const { calls, store: assets } = await store({ [FILE]: png })
    const [a, b] = await Promise.all([assets.resolve(FILE), assets.resolve(FILE)])
    expect(a).toBe(b)
    expect(calls).toEqual([FILE])
  })

  it('Cosense 上のファイルでなければ、そのまま返して取りに行かない', async () => {
    const { calls, store: assets } = await store({})
    expect(await assets.resolve('https://gyazo.com/abc.png')).toBe('https://gyazo.com/abc.png')
    expect(calls).toEqual([])
  })

  it('取れなければ警告して元の URL のまま返す。ビルドは止めない', async () => {
    const warnings: string[] = []
    const { store: assets } = await store({}, warnings)
    expect(await assets.resolve(FILE)).toBe(FILE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(FILE)
  })

  it('HTML の src と href のうち、Cosense 上のファイルだけを差し替える', async () => {
    const { store: assets } = await store({ [FILE]: png, [ICON]: png })
    const html = await assets.localizeHtml(
      `<img src="${FILE}"><a href="${ICON}">icon</a><img src="https://gyazo.com/x.png">`,
    )
    expect(html).toMatch(/<img src="\/_cosense\/[0-9a-f]{16}\.png"><a href="\/_cosense\//)
    expect(html).toContain('<img src="https://gyazo.com/x.png">')
  })

  it('HTML の属性値のエスケープを戻してから URL として扱う', async () => {
    const withQuery = 'https://scrapbox.io/files/abc.png?a=1&b=2'
    const { calls, store: assets } = await store({ [withQuery]: png })
    await assets.localizeHtml('<img src="https://scrapbox.io/files/abc.png?a=1&amp;b=2">')
    expect(calls).toEqual([withQuery])
  })
})

describe('rehypeCosenseAssets', () => {
  it('img の src と a の href を差し替える。コンポーネントの fallback の中も辿る', async () => {
    const { store: assets } = await store({ [FILE]: png, [ICON]: png })
    const img = { type: 'element', tagName: 'img', properties: { src: FILE }, children: [] }
    const tree = {
      type: 'root',
      children: [
        {
          type: 'cosenseComponent',
          name: 'X',
          attributes: [],
          fallback: { type: 'element', tagName: 'div', properties: {}, children: [img] },
          fallbackEnd: null,
          children: [{ type: 'element', tagName: 'a', properties: { href: ICON }, children: [] }],
        },
      ],
    }
    await rehypeCosenseAssets(assets)()(tree as unknown as Root)
    expect(JSON.stringify(tree)).not.toContain('scrapbox.io')
    expect(img.properties.src).toMatch(/^\/_cosense\//)
  })
})
