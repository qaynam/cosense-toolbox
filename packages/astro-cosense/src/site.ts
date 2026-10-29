/**
 * site.ts — プロジェクトの `.csn` / `.csnx` を全部読み、索引とリンクグラフを作る。
 *
 * リンクの解決には全ページのタイトルが要るので、1 ファイルずつのコンパイルの前にまとめて読む。
 * パースは軽いので、全ページを先読みしても問題にならない。
 *
 * `srcDir` ではなくプロジェクトのルートの下を読む。content collection の `glob()` は `base` を
 * ルートから解決するので、記事を `src` の外 (`./content` など) に置ける。
 */
import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"

import {
  buildGraph,
  createIndex,
  type Graph,
  type PageIndex,
  type ReadOptions,
  readPage,
} from "@cosense-toolbox/cosense-x/graph"

export const EXTENSIONS = [".csn", ".csnx"] as const

export const isCosenseFile = (path: string): boolean =>
  EXTENSIONS.some((extension) => path.endsWith(extension))

/** ルートからの相対パス (区切りは `/`)。Astro の content collection の `filePath` と同じ形。 */
export const idOf = (root: string, absolute: string): string =>
  relative(root, absolute).split(sep).join("/")

export interface Site {
  readonly index: PageIndex
  readonly graph: Graph
}

// lint は LSP の `checkSite` で読むので、飛ばすディレクトリを LSP とそろえる。ずれると、
// ビルドでは解決するリンクを lint が切れていると言う (その逆も起きる)。
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "build"])

const isSkipped = (name: string): boolean => name.startsWith(".") || SKIP_DIRECTORIES.has(name)

/** `directory` の下の `.csn` / `.csnx`。読めないディレクトリは空とみなす。 */
const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return isSkipped(entry.name) ? [] : listFiles(path)
      return entry.isFile() && isCosenseFile(entry.name) ? [path] : []
    }),
  )
  return nested.flat().sort()
}

/** `root` の下を読んで、索引とグラフを作る。id は `root` からの相対パス。 */
export const scanSite = async (
  root: string,
  options: Pick<ReadOptions, "parseOptions"> = {},
): Promise<Site> => {
  const files = await listFiles(root)
  const sources = await Promise.all(
    files.map(async (file) => ({ id: idOf(root, file), source: await readFile(file, "utf8") })),
  )
  const pages = sources.map(({ id, source }) => ({
    id,
    metadata: readPage(source, { ...options, filePath: id }).metadata,
  }))
  const index = createIndex(
    pages.map(({ id, metadata }) => ({
      id,
      title: metadata.title,
      slug: metadata.slug,
      draft: metadata.draft,
    })),
  )
  return { index, graph: buildGraph(pages) }
}

/** 索引とグラフを 1 つだけ持ち、Vite のプラグインと content collection で使い回す。 */
export interface SiteCache {
  readonly get: () => Promise<Site>
  /** ファイルが変わったときに捨てる。次の `get` で読み直す */
  readonly reset: () => void
}

export const createSiteCache = (
  root: string,
  options: Pick<ReadOptions, "parseOptions"> = {},
): SiteCache => {
  // dev サーバーでファイルが変わるたびに捨てて読み直すので、ここだけは状態を持つ。
  // モジュールのトップレベルではなく、統合ごとに作るこの関数の中に閉じ込めている。
  let site: Promise<Site> | undefined
  return {
    get: () => {
      site ??= scanSite(root, options)
      return site
    },
    reset: () => {
      site = undefined
    },
  }
}
