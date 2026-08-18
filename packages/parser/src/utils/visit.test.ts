import { describe, expect, it } from 'vitest'
import { parse } from '../parse'
import { collectLinks, collectProjectLinks, firstImage } from './links'
import { collect, find, visit } from './visit'

const page = parse(
  [
    'タイトル',
    '[リンクA] と #タグB',
    'code:main.ts',
    ' const a = 1',
    '[* 装飾の中の [リンクC]]',
    '[https://x.com/a.png]',
    '[/other/ページ]',
    'table:t',
    ' あ\tい',
    '[リンクA] は 2 回目',
  ].join('\n'),
)

describe('visit', () => {
  it('すべてのノードを深さ優先で辿る', () => {
    const types = new Set<string>()
    visit(page, (node) => {
      types.add(node.type)
    })
    expect(types).toContain('page')
    expect(types).toContain('codeLine')
    expect(types).toContain('tableCell')
    expect(types).toContain('decoration')
  })

  it('装飾の子まで辿る', () => {
    const labels = collect(page, 'internalLink').map((n) => n.label)
    expect(labels).toContain('リンクC')
  })

  it('型を指定するとそのノードだけ届く', () => {
    const seen: string[] = []
    visit(page, 'hashtag', (node) => {
      seen.push(node.value)
    })
    expect(seen).toEqual(['タグB'])
  })

  it('複数の型を指定できる', () => {
    const seen: string[] = []
    visit(page, ['hashtag', 'image'] as const, (node) => {
      seen.push(node.type)
    })
    expect(seen).toEqual(['hashtag', 'image'])
  })

  it('exit で走査を打ち切る', () => {
    let count = 0
    visit(page, 'internalLink', () => {
      count++
      return 'exit'
    })
    expect(count).toBe(1)
  })

  it('skip で子を辿らない', () => {
    const labels: string[] = []
    visit(page, (node) => {
      if (node.type === 'decoration') return 'skip'
      if (node.type === 'internalLink') labels.push(node.label)
      return undefined
    })
    expect(labels).not.toContain('リンクC')
    expect(labels).toContain('リンクA')
  })

  it('祖先ノードが渡る', () => {
    let ancestorTypes: string[] = []
    visit(page, 'tableCell', (_node, ancestors) => {
      ancestorTypes = ancestors.map((a) => a.type)
      return 'exit'
    })
    expect(ancestorTypes).toEqual(['page', 'table', 'tableRow'])
  })
})

describe('find', () => {
  it('最初に見つかったノードを返す', () => {
    expect(find(page, 'image')?.src).toBe('https://x.com/a.png')
  })

  it('見つからなければ null を返す', () => {
    expect(find(parse('タイトルだけ'), 'image')).toBeNull()
  })
})

describe('collectLinks', () => {
  it('内部リンクとハッシュタグを出現順・重複なしで集める', () => {
    expect(collectLinks(page)).toEqual(['リンクA', 'タグB', 'リンクC'])
  })

  it('既定ではプロジェクトリンクを含めない', () => {
    expect(collectLinks(page)).not.toContain('/other/ページ')
  })

  it('オプションでプロジェクトリンクを含められる', () => {
    expect(collectLinks(page, { includeProjectLinks: true })).toContain('/other/ページ')
  })

  it('コードブロックの中身は拾わない', () => {
    expect(collectLinks(parse('タイトル\ncode:x.ts\n [これはリンクではない]'))).toEqual([])
  })
})

describe('collectProjectLinks', () => {
  it('プロジェクトリンクを分解済みで返す', () => {
    expect(collectProjectLinks(page).map((n) => [n.project, n.title])).toEqual([
      ['other', 'ページ'],
    ])
  })
})

describe('firstImage', () => {
  it('最初の画像ノードを返す', () => {
    expect(firstImage(page)?.src).toBe('https://x.com/a.png')
  })

  it('画像が無ければ null を返す', () => {
    expect(firstImage(parse('タイトル\n本文'))).toBeNull()
  })
})
