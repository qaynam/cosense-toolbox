/**
 * site.ts — プロジェクトの `.csn` / `.csnx` を全部読み、索引とリンクグラフを作る。
 *
 * リンクの解決には全ページのタイトルが要るので、1 ファイルずつのコンパイルの前にまとめて読む。
 * パースは軽いので、全ページを先読みしても問題にならない。
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import {
  type Graph,
  type PageIndex,
  type ReadOptions,
  buildGraph,
  createIndex,
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

const listFiles = async (directory: string): Promise<string[]> => {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return SKIP_DIRECTORIES.has(entry.name) ? [] : listFiles(path)
      return entry.isFile() && isCosenseFile(entry.name) ? [path] : []
    }),
  )
  return nested.flat().sort()
}

/** `directory` の下を読んで、索引とグラフを作る。id は `root` からの相対パス。 */
export const scanSite = async (
  root: string,
  directory: string,
  options: Pick<ReadOptions, 'parseOptions'> = {},
): Promise<Site> => {
  const files = await listFiles(directory)
  const pages = await Promise.all(
    files.map(async (file) => {
      const id = idOf(root, file)
      const source = await readFile(file, 'utf8')
      return { id, metadata: readPage(source, { ...options, filePath: id }).metadata }
    }),
  )
  return {
    index: createIndex(
      pages.map(({ id, metadata }) => ({
        id,
        title: metadata.title,
        slug: metadata.slug,
        draft: metadata.draft,
      })),
    ),
    graph: buildGraph(pages),
  }
}
