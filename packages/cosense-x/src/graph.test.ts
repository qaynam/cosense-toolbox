import { describe, expect, it } from 'vitest'
import { scanPages } from './graph'

const files = [
  { id: 'posts/react.csn', source: 'React\n[JavaScript] のライブラリ #フロントエンド' },
  { id: 'posts/vue.csn', source: 'Vue\n[javascript] で書く #フロントエンド' },
  { id: 'posts/js.csn', source: 'JavaScript\n言語。[./notes/ts.csnx] も参照' },
  { id: 'posts/notes/ts.csnx', source: 'TypeScript\n型付きの [JavaScript]\n<Counter />' },
  { id: 'posts/svelte.csn', source: '---\ndraft: true\n---\nSvelte\n[JavaScript] #フロントエンド' },
]

describe('scanPages', () => {
  const graph = scanPages(files)

  it('draft のページはグラフに入れない', () => {
    expect(Object.keys(graph.pages).sort()).toEqual([
      'posts/js.csn',
      'posts/notes/ts.csnx',
      'posts/react.csn',
      'posts/vue.csn',
    ])
  })

  it('リンク先は手元にあるページだけを id で持つ。相対パスのリンクも含む', () => {
    expect(graph.links['posts/react.csn']).toEqual(['posts/js.csn'])
    expect(graph.links['posts/js.csn']).toEqual(['posts/notes/ts.csnx'])
  })

  it('逆リンクは、そのページにリンクしているページ。タイトルの表記揺れは無視する', () => {
    expect(graph.backlinks['posts/js.csn']).toEqual([
      'posts/react.csn',
      'posts/vue.csn',
      'posts/notes/ts.csnx',
    ])
    expect(graph.backlinks['posts/notes/ts.csnx']).toEqual(['posts/js.csn'])
  })

  it('2 hop は、同じページやタグにリンクしている別のページを経由先ごとにまとめる', () => {
    expect(graph.twoHop['posts/react.csn']).toEqual([
      { via: 'JavaScript', viaId: 'posts/js.csn', pages: ['posts/vue.csn', 'posts/notes/ts.csnx'] },
      { via: 'フロントエンド', viaId: null, pages: ['posts/vue.csn'] },
    ])
  })

  it('2 hop に、直接リンクしているページや逆リンクのページは重ねて出さない', () => {
    expect(graph.twoHop['posts/js.csn']).toEqual([])
  })

  it('タグごとにページをまとめる', () => {
    expect(graph.tags).toEqual({
      フロントエンド: { name: 'フロントエンド', pages: ['posts/react.csn', 'posts/vue.csn'] },
    })
  })

  it('説明文の相対パスのリンクは、リンク先のタイトルになる', () => {
    expect(graph.pages['posts/js.csn']?.description).toBe('言語。TypeScript も参照')
  })

  it('ページの情報に metadata を持つ', () => {
    expect(graph.pages['posts/react.csn']).toEqual({
      id: 'posts/react.csn',
      title: 'React',
      slug: 'React',
      description: 'JavaScript のライブラリ フロントエンド',
      image: null,
      tags: ['フロントエンド'],
    })
  })
})
