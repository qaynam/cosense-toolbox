import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Root } from 'hast'
import { describe, expect, it } from 'vitest'

import { type AssetStoreOptions, createAssetStore, rehypeCosenseAssets } from './assets'

const FILE = 'https://scrapbox.io/files/abc.png'
const ZIP = 'https://scrapbox.io/files/def.zip'
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

const tempDir = () => mkdtemp(join(tmpdir(), 'cosense-assets-'))

const store = async (
  table: Record<string, () => Response>,
  options: { warnings?: string[]; cacheDir?: string } & Pick<AssetStoreOptions, 'links'> = {},
) => {
  const cacheDir = options.cacheDir ?? (await tempDir())
  const { calls, fetch } = routes(table)
  return {
    calls,
    cacheDir,
    store: createAssetStore({
      cacheDir,
      publicPath: '/_cosense/',
      fetchOptions: { fetch },
      warn: (message) => options.warnings?.push(message),
      ...(options.links === undefined ? {} : { links: options.links }),
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

  it('アップロードしたファイルの名前には、ファイル ID を出さない', async () => {
    const { store: assets } = await store({ [FILE]: png })
    expect(await assets.resolve(FILE)).not.toContain('abc')
  })

  it('アイコンの名前には、ハッシュのあとにユーザー名を付ける', async () => {
    const { store: assets } = await store({ [ICON]: png })
    expect(await assets.resolve(ICON)).toMatch(/^\/_cosense\/[0-9a-f]{16}_user\.png$/)
  })

  it('日本語のユーザー名は、ファイル名はそのままで、URL ではエンコードする', async () => {
    const icon = 'https://scrapbox.io/api/pages/icons/%E7%82%8E%E4%B8%8A/icon'
    const { cacheDir, store: assets } = await store({ [icon]: png })
    expect(await assets.resolve(icon)).toMatch(/^\/_cosense\/[0-9a-f]{16}_%E7%82%8E%E4%B8%8A\.png$/)
    expect(await readdir(cacheDir)).toEqual([expect.stringMatching(/^[0-9a-f]{16}_炎上\.png$/)])
  })

  it('ユーザー名のうち、ファイル名や URL に使えない文字は _ にする', async () => {
    const icon = 'https://scrapbox.io/api/pages/p/a%20b%3Fc%23d/icon'
    const { store: assets } = await store({ [icon]: png })
    expect(await assets.resolve(icon)).toMatch(/^\/_cosense\/[0-9a-f]{16}_a_b_c_d\.png$/)
  })

  it('同じ URL は 1 回しか取りに行かない', async () => {
    const { calls, store: assets } = await store({ [FILE]: png })
    const [a, b] = await Promise.all([assets.resolve(FILE), assets.resolve(FILE)])
    expect(a).toBe(b)
    expect(calls).toEqual([FILE])
  })

  it('アップロードしたファイルは中身が変わらないので、前のビルドで取ったものを使い回す', async () => {
    const first = await store({ [FILE]: png })
    const url = await first.store.resolve(FILE)
    const second = await store({}, { cacheDir: first.cacheDir })
    expect(await second.store.resolve(FILE)).toBe(url)
    expect(second.calls).toEqual([])
  })

  it('アイコンは差し替えられることがあるので、ビルドごとに取り直す', async () => {
    const first = await store({ [ICON]: png })
    await first.store.resolve(ICON)
    const second = await store({ [ICON]: png }, { cacheDir: first.cacheDir })
    await second.store.resolve(ICON)
    expect(second.calls).toEqual([ICON])
  })

  it('Cosense 上のファイルでなければ、そのまま返して取りに行かない', async () => {
    const { calls, store: assets } = await store({})
    expect(await assets.resolve('https://gyazo.com/abc.png')).toBe('https://gyazo.com/abc.png')
    expect(calls).toEqual([])
  })

  it('取れなければ警告して元の URL のまま返す。ビルドは止めない', async () => {
    const warnings: string[] = []
    const { store: assets } = await store({}, { warnings })
    expect(await assets.resolve(FILE)).toBe(FILE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(FILE)
  })

  it('copyUsedTo は、このビルドで使ったファイルだけを写す', async () => {
    const { cacheDir, store: assets } = await store({ [FILE]: png })
    await writeFile(join(cacheDir, '0000000000000000.png'), 'old')
    const url = await assets.resolve(FILE)
    const out = await tempDir()
    await assets.copyUsedTo(out)
    expect((await readdir(out)).map((name) => `/_cosense/${name}`)).toEqual([url])
  })
})

describe('localizeHtml', () => {
  it('img の src のうち、Cosense 上のファイルだけを差し替える', async () => {
    const { store: assets } = await store({ [FILE]: png })
    const html = await assets.localizeHtml(`<img src="${FILE}"><img src="https://gyazo.com/x.png">`)
    expect(html).toMatch(/^<img src="\/_cosense\/[0-9a-f]{16}\.png">/)
    expect(html).toContain('<img src="https://gyazo.com/x.png">')
  })

  it('リンクしたファイルは、既定では元の URL のまま残す', async () => {
    const { calls, store: assets } = await store({ [ZIP]: png })
    const html = `<a href="${ZIP}">zip</a>`
    expect(await assets.localizeHtml(html)).toBe(html)
    expect(calls).toEqual([])
  })

  it("links: 'download' なら、リンクしたファイルも取ってきて差し替える", async () => {
    const { store: assets } = await store({ [ZIP]: png }, { links: 'download' })
    expect(await assets.localizeHtml(`<a href="${ZIP}">zip</a>`)).toMatch(
      /^<a href="\/_cosense\/[0-9a-f]{16}\.png">zip<\/a>$/,
    )
  })

  it('HTML の属性値のエスケープを戻してから URL として扱う', async () => {
    const withQuery = 'https://scrapbox.io/files/abc.png?a=1&b=2'
    const { calls, store: assets } = await store({ [withQuery]: png })
    await assets.localizeHtml('<img src="https://scrapbox.io/files/abc.png?a=1&amp;b=2">')
    expect(calls).toEqual([withQuery])
  })
})

describe('rehypeCosenseAssets', () => {
  /** コンポーネントの fallback の中に画像、children の中にリンクを持つ木。 */
  const treeWith = () => {
    const img = { type: 'element', tagName: 'img', properties: { src: FILE }, children: [] }
    const a = { type: 'element', tagName: 'a', properties: { href: ZIP }, children: [] }
    const tree = {
      type: 'root',
      children: [
        {
          type: 'cosenseComponent',
          name: 'X',
          attributes: [],
          fallback: { type: 'element', tagName: 'div', properties: {}, children: [img] },
          fallbackEnd: null,
          children: [a],
        },
      ],
    }
    return { img, a, tree: tree as unknown as Root }
  }

  it('img の src を差し替える。コンポーネントの fallback の中も辿る。リンクは既定では残す', async () => {
    const { store: assets } = await store({ [FILE]: png, [ZIP]: png })
    const { img, a, tree } = treeWith()
    await rehypeCosenseAssets(assets)()(tree)
    expect(img.properties.src).toMatch(/^\/_cosense\//)
    expect(a.properties.href).toBe(ZIP)
  })

  it("links: 'download' なら a の href も差し替える", async () => {
    const { store: assets } = await store({ [FILE]: png, [ZIP]: png }, { links: 'download' })
    const { a, tree } = treeWith()
    await rehypeCosenseAssets(assets)()(tree)
    expect(a.properties.href).toMatch(/^\/_cosense\//)
  })
})
