import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idOf, isCosenseFile, scanSite } from './site'

const FILES: Record<string, string> = {
  'src/content/posts/a.csn': 'Page A\n[Page B] と [./notes/c.csnx]',
  'src/content/posts/b.csn': 'Page B\n#タグ',
  'src/content/posts/notes/c.csnx': 'Page C\n<Counter />\n[page_a]',
  'src/content/posts/draft.csn': '---\ndraft: true\n---\n下書き\n[Page A]',
  'src/pages/about.csnx': 'About\n[Page A]',
  'src/content/posts/readme.md': '# 対象外',
  'node_modules/pkg/x.csn': '対象外',
}

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cosense-astro-'))
  for (const [path, source] of Object.entries(FILES)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), source)
  }
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanSite', () => {
  it('src の下の .csn / .csnx を、ルートからの相対パスを id にして索引に載せる', async () => {
    const { index } = await scanSite(root, join(root, 'src'))
    expect(Object.keys(index.pages).sort()).toEqual([
      'src/content/posts/a.csn',
      'src/content/posts/b.csn',
      'src/content/posts/notes/c.csnx',
      'src/pages/about.csnx',
    ])
  })

  it('グラフの逆リンクは、相対パスのリンクと src/pages のページも含む', async () => {
    const { graph } = await scanSite(root, join(root, 'src'))
    expect(graph.backlinks['src/content/posts/a.csn']).toEqual([
      'src/content/posts/notes/c.csnx',
      'src/pages/about.csnx',
    ])
    expect(graph.backlinks['src/content/posts/notes/c.csnx']).toEqual(['src/content/posts/a.csn'])
  })

  it('説明文の相対パスのリンクは、リンク先のタイトルになる', async () => {
    const { graph } = await scanSite(root, join(root, 'src'))
    expect(graph.pages['src/content/posts/a.csn']?.description).toBe('Page B と Page C')
  })

  it('ディレクトリが無ければ空のサイトになる', async () => {
    const { index } = await scanSite(root, join(root, 'missing'))
    expect(index.pages).toEqual({})
  })
})

describe('idOf / isCosenseFile', () => {
  it('id は区切りを / にしたルートからの相対パス', () => {
    expect(idOf('/project', '/project/src/a.csn')).toBe('src/a.csn')
  })

  it('.csn と .csnx だけを対象にする', () => {
    expect(['a.csn', 'a.csnx', 'a.md', 'a.csn.bak'].map(isCosenseFile)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })
})
