/**
 * `@cosense-toolbox/cosense-x/graph` — ページどうしのリンクから、逆リンクと 2 hop リンクを作る。
 *
 * JS の生成 (unified 系) を import しないので、一覧ページやサイトマップを作るだけなら
 * このサブパスだけで済む。
 */
import { Option } from "effect"

import { createIndex, pageByPath, pageByTitle, type PageIndex } from "./links"
import type { PageMetadata } from "./metadata"
import { type ReadOptions, readPage } from "./read"
import { isRelativePath, normalizeTitle, uniqueTitles } from "./title"

export { createIndex, findByTitle } from "./links"
export type { IndexInput, IndexedPage, PageIndex } from "./links"
export { formatOf, readPage } from "./read"
export type { Format, ReadOptions, ReadResult } from "./read"
export { normalizeTitle, titleToSlug } from "./title"

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

/** 値をキーごとにまとめる。キーの並びも、キーごとの値の並びも出てきた順。 */
const groupBy = <A>(
  entries: readonly (readonly [string, A])[],
): ReadonlyMap<string, readonly A[]> =>
  entries.reduce(
    (groups, [key, value]) => groups.set(key, [...(groups.get(key) ?? []), value]),
    new Map<string, readonly A[]>(),
  )

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
  const idOf = (title: string): Option.Option<string> =>
    Option.map(pageByTitle(index, title), (page) => page.id)

  /** ページ id と、そのページのリンク先のタイトル (書かれた形のまま、重複なし・自分を除く) */
  const outgoing = published.map(({ id, metadata }) => {
    const self = normalizeTitle(metadata.title)
    const linked = metadata.links.flatMap((link) =>
      isRelativePath(link)
        ? Option.match(pageByPath(index, id, link), {
            onNone: () => [],
            onSome: (page) => [page.title],
          })
        : [link],
    )
    const titles = uniqueTitles([...linked, ...metadata.tags]).filter(
      (title) => normalizeTitle(title) !== self,
    )
    return { id, metadata, titles }
  })

  // 正規化タイトル → そこへリンクしているページ
  const incoming = groupBy(
    outgoing.flatMap(({ id, titles }) =>
      titles.map((title) => [normalizeTitle(title), id] as const),
    ),
  )
  const incomingOf = (title: string): readonly string[] => incoming.get(normalizeTitle(title)) ?? []

  const tagGroups = groupBy(
    published.flatMap(({ id, metadata }) =>
      metadata.tags.map((tag) => [normalizeTitle(tag), { name: tag, id }] as const),
    ),
  )

  const entries = outgoing.map(({ id, metadata, titles }) => {
    const links = titles.flatMap((title) => Option.toArray(idOf(title)))
    const backlinks = incomingOf(metadata.title)
    const direct = new Set([id, ...links, ...backlinks])
    const twoHop = titles.flatMap((via): TwoHopGroup[] => {
      const viaId = Option.getOrNull(idOf(via))
      const siblings = incomingOf(via).filter((other) => !direct.has(other) && other !== viaId)
      return siblings.length === 0 ? [] : [{ via, viaId, pages: siblings }]
    })
    const page: GraphPage = {
      id,
      title: metadata.title,
      slug: metadata.slug,
      description: metadata.description,
      image: metadata.image,
      tags: metadata.tags,
    }
    return { id, page, links, backlinks, twoHop }
  })

  return {
    pages: Object.fromEntries(entries.map(({ id, page }) => [id, page])),
    links: Object.fromEntries(entries.map(({ id, links }) => [id, links])),
    backlinks: Object.fromEntries(entries.map(({ id, backlinks }) => [id, backlinks])),
    twoHop: Object.fromEntries(entries.map(({ id, twoHop }) => [id, twoHop])),
    tags: Object.fromEntries(
      [...tagGroups].map(([key, group]) => [
        key,
        { name: group[0]?.name ?? "", pages: group.map((tag) => tag.id) },
      ]),
    ),
  }
}

export interface ScanInput {
  readonly id: string
  readonly source: string
}

/**
 * ファイルの中身をまとめて読み、グラフを作る。形式は id の拡張子から決める。
 *
 * 2 回に分けて読む。説明文の中の相対パスのリンクをタイトルにするには全ページの索引が要り、
 * 索引に載せるタイトルは説明文に依存しないので、先にタイトルだけで索引を作れる。
 */
export const scanPages = (
  files: readonly ScanInput[],
  options: Omit<ReadOptions, "filePath" | "format" | "index"> = {},
): Graph => {
  const index = createIndex(
    files.map(({ id, source }) => {
      const { metadata } = readPage(source, { ...options, filePath: id })
      return { id, title: metadata.title, slug: metadata.slug, draft: metadata.draft }
    }),
  )
  return buildGraph(
    files.map(({ id, source }) => ({
      id,
      metadata: readPage(source, { ...options, filePath: id, index }).metadata,
    })),
  )
}
