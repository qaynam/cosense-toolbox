/**
 * `@cosense-toolbox/cosense-x/graph` — ページどうしのリンクから、逆リンクと 2 hop リンクを作る。
 *
 * JS の生成 (unified 系) を import しないので、一覧ページやサイトマップを作るだけなら
 * このサブパスだけで済む。
 */
import { type PageIndex, createIndex, findByTitle } from './links'
import type { PageMetadata } from './metadata'
import { type ReadOptions, readPage } from './read'
import { isRelativePath, normalizeTitle, resolveRelativePath } from './title'

export { createIndex, findByTitle } from './links'
export type { IndexInput, IndexedPage, PageIndex } from './links'
export { formatOf, readPage } from './read'
export type { Format, ReadOptions, ReadResult } from './read'
export { normalizeTitle, titleToSlug } from './title'

/** グラフの入力。`readPage` の結果の `metadata` と、ファイルの id を渡す。 */
export interface GraphInput {
  readonly id: string
  readonly metadata: PageMetadata
}

export interface GraphPage {
  readonly id: string
  readonly title: string
  readonly slug: string
  readonly description: string
  readonly image: string | null
  readonly tags: readonly string[]
}

/** 同じページ (または同じタグ) にリンクしている、別のページの集まり。 */
export interface TwoHopGroup {
  /** 経由したページのタイトル。タグやまだ無いページでもよい (Cosense と同じ) */
  readonly via: string
  /** 経由したページが手元にあればその id */
  readonly viaId: string | null
  readonly pages: readonly string[]
}

/** JSON にして持ち回れるよう、すべて id の配列で持つ。draft のページは含まない。 */
export interface Graph {
  readonly pages: Readonly<Record<string, GraphPage>>
  /** そのページからリンクしている、手元にあるページ */
  readonly links: Readonly<Record<string, readonly string[]>>
  /** そのページにリンクしているページ */
  readonly backlinks: Readonly<Record<string, readonly string[]>>
  readonly twoHop: Readonly<Record<string, readonly TwoHopGroup[]>>
  /** `normalizeTitle` したタグ → 最初に出てきた書き方と、そのタグを持つページ */
  readonly tags: Readonly<
    Record<string, { readonly name: string; readonly pages: readonly string[] }>
  >
}

/**
 * ページの一覧からリンクグラフを作る。
 *
 * Cosense ではタグもリンクなので、2 hop はタグ経由でもつながる。
 * 相対パスのリンクは、リンク先のタイトルへのリンクと同じに扱う。
 */
export const buildGraph = (inputs: readonly GraphInput[]): Graph => {
  const published = inputs.filter((input) => !input.metadata.draft)
  const index: PageIndex = createIndex(
    published.map(({ id, metadata }) => ({ id, title: metadata.title, slug: metadata.slug })),
  )

  const pages: Record<string, GraphPage> = {}
  // ページ id → リンク先の正規化タイトルと、その書き方
  const targets = new Map<string, Map<string, string>>()
  const tags: Record<string, { name: string; pages: string[] }> = {}

  for (const { id, metadata } of published) {
    pages[id] = {
      id,
      title: metadata.title,
      slug: metadata.slug,
      description: metadata.description,
      image: metadata.image,
      tags: metadata.tags,
    }
    const out = new Map<string, string>()
    const self = normalizeTitle(metadata.title)
    const add = (title: string) => {
      const key = normalizeTitle(title)
      if (key !== '' && key !== self && !out.has(key)) out.set(key, title)
    }
    for (const link of metadata.links) {
      if (!isRelativePath(link)) add(link)
      else {
        const page = index.pages[resolveRelativePath(id, link)]
        if (page !== undefined) add(page.title)
      }
    }
    for (const tag of metadata.tags) {
      add(tag)
      const key = normalizeTitle(tag)
      const entry = tags[key] ?? { name: tag, pages: [] }
      entry.pages.push(id)
      tags[key] = entry
    }
    targets.set(id, out)
  }

  // 正規化タイトル → そこへリンクしているページ
  const incoming = new Map<string, string[]>()
  for (const [id, out] of targets) {
    for (const key of out.keys()) {
      const list = incoming.get(key) ?? []
      list.push(id)
      incoming.set(key, list)
    }
  }

  const links: Record<string, string[]> = {}
  const backlinks: Record<string, string[]> = {}
  const twoHop: Record<string, TwoHopGroup[]> = {}

  for (const [id, out] of targets) {
    const page = pages[id] as GraphPage
    links[id] = [...out.values()]
      .map((title) => findByTitle(index, title)?.id)
      .filter((linked): linked is string => linked !== undefined)
    backlinks[id] = incoming.get(normalizeTitle(page.title)) ?? []

    const direct = new Set([id, ...links[id], ...backlinks[id]])
    twoHop[id] = [...out.entries()].flatMap(([key, via]): TwoHopGroup[] => {
      const viaId = findByTitle(index, via)?.id ?? null
      const siblings = (incoming.get(key) ?? []).filter(
        (other) => !direct.has(other) && other !== viaId,
      )
      return siblings.length === 0 ? [] : [{ via, viaId, pages: siblings }]
    })
  }

  return { pages, links, backlinks, twoHop, tags }
}

export interface ScanInput {
  readonly id: string
  readonly source: string
}

/** ファイルの中身をまとめて読み、グラフを作る。形式は id の拡張子から決める。 */
export const scanPages = (
  files: readonly ScanInput[],
  options: Omit<ReadOptions, 'filePath' | 'format'> = {},
): Graph =>
  buildGraph(
    files.map(({ id, source }) => ({
      id,
      metadata: readPage(source, { ...options, filePath: id }).metadata,
    })),
  )
