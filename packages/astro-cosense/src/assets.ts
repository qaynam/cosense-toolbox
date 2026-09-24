/**
 * assets.ts — Cosense 上の画像やファイルを、ビルド時に取ってきてサイトの中に置く。
 *
 * Cosense のファイル (`/files/…`) とアイコン (`/api/pages/…/icon`) は
 * `Cross-Origin-Resource-Policy: same-origin` を返すので、別のサイトの `<img>` からは読めない。
 * リダイレクト先も期限付きの URL (`/files/` は 5 分で切れる) なので、URL を解決して埋め込むだけでは
 * 公開する頃には表示されなくなる。そのため中身を取ってきて、サイトと同じ場所に置く。
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type FetchOptions, fetchAsset, isCosenseAssetUrl } from '@cosense-toolbox/cosense-x/fetch'
import type { Root } from 'hast'

/** `globalThis` に置き場を置くときのキー (`Symbol.for` に渡す)。 */
export const ASSET_STORE_KEY = '@cosense-toolbox/astro/assets'

export interface AssetStoreOptions {
  /** 取ってきたファイルを置くディレクトリ。ビルドの終わりにここから出力先に写す */
  readonly cacheDir: string
  /** サイトの中で、そのディレクトリを配信するパス。`/` で終わる */
  readonly publicPath: string
  /** PAT などの取得のオプション */
  readonly fetchOptions?: FetchOptions
  /** 取れなかったときに呼ぶ */
  readonly warn?: (message: string) => void
}

export interface AssetStore {
  /** Cosense 上のファイルなら、取ってきて置いたサイトの中の URL を返す。それ以外はそのまま返す */
  readonly resolve: (url: string) => Promise<string>
  /** HTML の `src` / `href` のうち、Cosense 上のファイルを指すものを差し替える */
  readonly localizeHtml: (html: string) => Promise<string>
  readonly cacheDir: string
  readonly publicPath: string
}

/** Content-Type から付ける拡張子。静的なホスティングは拡張子で Content-Type を決めるため。 */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'audio/mpeg': '.mp3',
}

/** Content-Type で決まらなければ、元の URL の拡張子を使う。 */
const extensionOf = (url: string, contentType: string): string => {
  const known = EXTENSIONS[contentType.split(';')[0]?.trim().toLowerCase() ?? '']
  if (known !== undefined) return known
  return /\.[A-Za-z0-9]{1,5}$/.exec(new URL(url).pathname)?.[0]?.toLowerCase() ?? ''
}

/** ファイル名は元の URL から決める。同じ URL は何度ビルドしても同じ名前になる。 */
const nameOf = (url: string): string => createHash('sha256').update(url).digest('hex').slice(0, 16)

const unescapeAttribute = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const ATTRIBUTE_RE = /(\s(?:src|href)=")([^"]*)(")/g

export const createAssetStore = (options: AssetStoreOptions): AssetStore => {
  const fetchOptions = options.fetchOptions ?? {}
  const isAsset = (url: string) => isCosenseAssetUrl(url, fetchOptions)
  // 同じファイルを何度も取りに行かないよう、URL ごとに取得の Promise を覚えておく。
  const downloads = new Map<string, Promise<string>>()

  const download = async (url: string): Promise<string> => {
    try {
      const asset = await fetchAsset(url, fetchOptions)
      const file = `${nameOf(url)}${extensionOf(url, asset.contentType)}`
      await mkdir(options.cacheDir, { recursive: true })
      await writeFile(join(options.cacheDir, file), asset.data)
      return `${options.publicPath}${file}`
    } catch (error) {
      // 1 つの画像のためにビルド全体を止めない。元の URL のまま出し、表示されないことを知らせる。
      options.warn?.(`${url} を取得できないので、元の URL のまま出す: ${String(error)}`)
      return url
    }
  }

  const resolve = (url: string): Promise<string> => {
    if (!isAsset(url)) return Promise.resolve(url)
    const cached = downloads.get(url) ?? download(url)
    downloads.set(url, cached)
    return cached
  }

  const localizeHtml = async (html: string): Promise<string> => {
    const urls = [...html.matchAll(ATTRIBUTE_RE)]
      .map((match) => unescapeAttribute(match[2] ?? ''))
      .filter(isAsset)
    const resolved = new Map(
      await Promise.all(urls.map(async (url) => [url, await resolve(url)] as const)),
    )
    // サイトの中の URL はエスケープの要る文字を含まない。
    return html.replace(ATTRIBUTE_RE, (whole, open: string, value: string, close: string) => {
      const local = resolved.get(unescapeAttribute(value))
      return local === undefined ? whole : `${open}${local}${close}`
    })
  }

  return { resolve, localizeHtml, cacheDir: options.cacheDir, publicPath: options.publicPath }
}

interface HastLike {
  readonly type?: string
  readonly tagName?: string
  readonly properties?: Record<string, unknown>
  readonly children?: readonly HastLike[]
  readonly fallback?: HastLike | null
  readonly fallbackEnd?: HastLike | null
}

/** `img` の `src` と `a` の href。書き換えられるよう、要素とプロパティ名の組で返す。 */
const referencesIn = (node: HastLike): (readonly [Record<string, unknown>, 'src' | 'href'])[] => {
  const own =
    node.type === 'element' && node.properties !== undefined
      ? node.tagName === 'img'
        ? [[node.properties, 'src'] as const]
        : node.tagName === 'a'
          ? [[node.properties, 'href'] as const]
          : []
      : []
  // コンポーネントのノードは、渡されなかったときに出す元の行 (fallback) も持つ。
  const nested = [...(node.children ?? []), node.fallback, node.fallbackEnd].filter(
    (child): child is HastLike => child !== null && child !== undefined,
  )
  return [...own, ...nested.flatMap(referencesIn)]
}

/** `.csn` / `.csnx` の hast の中で、Cosense 上のファイルを指す URL を差し替える rehype プラグイン。 */
export const rehypeCosenseAssets = (store: AssetStore) => () => async (tree: Root) => {
  await Promise.all(
    referencesIn(tree as HastLike).map(async ([properties, key]) => {
      const value = properties[key]
      // hast は要素のプロパティをその場で書き換えるのが決まりなので、ここでも書き換える。
      if (typeof value === 'string') properties[key] = await store.resolve(value)
    }),
  )
}
