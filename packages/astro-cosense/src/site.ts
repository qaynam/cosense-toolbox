/**
 * site.ts — プロジェクトの `.csn` / `.csnx` を全部読み、索引とリンクグラフを作る。
 *
 * リンクの解決には全ページのタイトルが要るので、1 ファイルずつのコンパイルの前にまとめて読む。
 * パースは軽いので、全ページを先読みしても問題にならない。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import {
  buildGraph,
  createIndex,
  type Graph,
  type PageIndex,
  type ReadOptions,
  readPage,
} from '@cosense-toolbox/cosense-x/graph'

export const EXTENSIONS = ['.csn', '.csnx'] as const

export const isCosenseFile = (path: string): boolean =>
  EXTENSIONS.some((extension) => path.endsWith(extension))

/** ルートからの相対パス (区切りは `/`)。Astro の content collection の `filePath` と同じ形。 */
export const idOf = (root: string, absolute: string): string =>
  relative(root, absolute).split(sep).join('/')

export interface Site {
  readonly index: PageIndex
  readonly graph: Graph
}

const SKIP_DIRECTORIES = new Set(['node_modules', '.astro', 'dist'])

/** `directory` の下の `.csn` / `.csnx`。読めないディレクトリ (まだ無い src/content など) は空とみなす。 */
const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return SKIP_DIRECTORIES.has(entry.name) ? [] : listFiles(path)
      return entry.isFile() && isCosenseFile(entry.name) ? [path] : []
    }),
  )
  return nested.flat().sort()
}

/**
 * `directory` の下を読んで、索引とグラフを作る。id は `root` からの相対パス。
 *
 * 説明文の中の相対パスのリンクをタイトルにするには索引が要るので、
 * タイトルだけで索引を作ってから、索引を渡して読み直す。ファイルの読み込みは 1 回だけ。
 */
export const scanSite = async (
  root: string,
  directory: string,
  options: Pick<ReadOptions, 'parseOptions'> = {},
): Promise<Site> => {
  const files = await listFiles(directory)
  const sources = await Promise.all(
    files.map(async (file) => ({ id: idOf(root, file), source: await readFile(file, 'utf8') })),
  )
  const index = createIndex(
    sources.map(({ id, source }) => {
      const { metadata } = readPage(source, { ...options, filePath: id })
      return { id, title: metadata.title, slug: metadata.slug, draft: metadata.draft }
    }),
  )
  const graph = buildGraph(
    sources.map(({ id, source }) => ({
      id,
      metadata: readPage(source, { ...options, filePath: id, index }).metadata,
    })),
  )
  return { index, graph }
}

/** 索引とグラフを 1 つだけ持ち、Vite のプラグインと content collection で使い回す。 */
export interface SiteCache {
  readonly get: () => Promise<Site>
  /** ファイルが変わったときに捨てる。次の `get` で読み直す */
  readonly reset: () => void
}

export const createSiteCache = (
  root: string,
  directory: string,
  options: Pick<ReadOptions, 'parseOptions'> = {},
): SiteCache => {
  // dev サーバーでファイルが変わるたびに捨てて読み直すので、ここだけは状態を持つ。
  // モジュールのトップレベルではなく、統合ごとに作るこの関数の中に閉じ込めている。
  let site: Promise<Site> | undefined
  return {
    get: () => {
      site ??= scanSite(root, directory, options)
      return site
    },
    reset: () => {
      site = undefined
    },
  }
}
