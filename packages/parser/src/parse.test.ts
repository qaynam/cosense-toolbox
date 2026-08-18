/**
 * ページ全体・行レベルの仕様。ブロック構造 (タイトル / code: / table:) はここで検証する。
 */
import { describe, expect, it } from 'vitest'
import { parse, parseLine } from './parse'
import { stripPositions } from './test-helpers'
import type { CodeBlock, LineBlock, TableBlock, TopLevelBlock } from './types'

/** タイトル行を省いて本文だけ書けるようにする (テストの意図をタイトルで濁らせない)。 */
const body = (...lines: string[]): readonly TopLevelBlock[] =>
  parse(['title', ...lines].join('\n')).children.slice(1)

const blockAt = <T extends TopLevelBlock['type']>(
  blocks: readonly TopLevelBlock[],
  index: number,
  type: T,
): Extract<TopLevelBlock, { type: T }> => {
  const block = blocks[index]
  if (block?.type !== type) throw new Error(`expected ${type} at ${index}, got ${block?.type}`)
  return block as Extract<TopLevelBlock, { type: T }>
}

describe('ページ', () => {
  it('1 行目はタイトルになる', () => {
    const page = parse('ページタイトル\n本文')
    expect(page.type).toBe('page')
    expect(stripPositions(page.children[0])).toEqual({
      type: 'title',
      value: 'ページタイトル',
      children: [{ type: 'text', value: 'ページタイトル' }],
    })
    expect(page.children[1]?.type).toBe('line')
  })

  it('タイトル行は code: や table: として解釈しない', () => {
    expect(parse('code:main.ts').children[0]?.type).toBe('title')
    expect(parse('table:data').children[0]?.type).toBe('title')
  })

  it('空文字列でも空のタイトル 1 つを返す', () => {
    const page = parse('')
    expect(page.children).toHaveLength(1)
    expect(stripPositions(page.children[0])).toEqual({ type: 'title', value: '', children: [] })
  })

  it('CRLF は LF として扱う', () => {
    const page = parse('title\r\nfoo')
    expect(page.children).toHaveLength(2)
    expect(stripPositions(blockAt(page.children, 1, 'line').children)).toEqual([
      { type: 'text', value: 'foo' },
    ])
  })
})

describe('行', () => {
  it('行頭の空白をインデントとして数える', () => {
    expect(blockAt(body('  foo'), 0, 'line').indent).toBe(2)
    expect(blockAt(body('\t\tfoo'), 0, 'line').indent).toBe(2)
    expect(blockAt(body('　foo'), 0, 'line').indent).toBe(1)
  })

  it('> で始まる行は引用になり記号は本文に含まれない', () => {
    const line = blockAt(body('> 引用文'), 0, 'line')
    expect(line.quote).toBe(true)
    expect(stripPositions(line.children)).toEqual([{ type: 'text', value: '引用文' }])
  })

  it('行頭が $ や % の行は等幅になる', () => {
    expect(blockAt(body('$ x = 1'), 0, 'line').monospace).toBe(true)
    expect(blockAt(body('% x = 1'), 0, 'line').monospace).toBe(true)
    expect(blockAt(body('x = 1'), 0, 'line').monospace).toBe(false)
  })

  it('空行は子を持たない行になる', () => {
    const line = blockAt(body(''), 0, 'line')
    expect(line.children).toEqual([])
    expect(line.indent).toBe(0)
  })
})

describe('code: ブロック', () => {
  it('ヘッダより深いインデントの行を本体としてまとめる', () => {
    const blocks = body('code:main.ts', ' const a = 1', ' const b = 2', 'あと')
    const code = blockAt(blocks, 0, 'codeBlock')
    expect(code.filename).toBe('main.ts')
    expect(code.indent).toBe(0)
    expect(code.lines.map((l) => l.value)).toEqual(['const a = 1', 'const b = 2'])
    expect(blocks).toHaveLength(2)
    expect(blockAt(blocks, 1, 'line').children).toHaveLength(1)
  })

  it('本体行はブロックの相対インデントを保つ', () => {
    const code = blockAt(
      body('code:main.ts', ' function f() {', '   return 1', ' }'),
      0,
      'codeBlock',
    )
    expect(code.lines.map((l) => l.value)).toEqual(['function f() {', '  return 1', '}'])
  })

  it('インデントされたヘッダの本体はさらに深い行になる', () => {
    const code = blockAt(body(' code:main.ts', '  const a = 1', ' 出た'), 0, 'codeBlock')
    expect(code.indent).toBe(1)
    expect(code.lines.map((l) => l.value)).toEqual(['const a = 1'])
  })

  it('本体の中の記法は解釈しない', () => {
    const code = blockAt(body('code:main.ts', ' [リンク] `code` #tag'), 0, 'codeBlock')
    expect(code.lines[0]?.value).toBe('[リンク] `code` #tag')
  })

  it('本体が無くてもコードブロックになる', () => {
    const code = blockAt(body('code:empty.txt'), 0, 'codeBlock')
    expect(code.lines).toEqual([])
  })

  it('コードブロックの中では table: を解釈しない', () => {
    const code = blockAt(body('code:main.ts', ' table:notATable'), 0, 'codeBlock')
    expect(code.lines.map((l) => l.value)).toEqual(['table:notATable'])
  })

  it('コードブロックを抜けた直後の table: は解釈する', () => {
    const blocks = body('code:main.ts', ' const a = 1', 'table:data', ' a\tb')
    expect(blocks).toHaveLength(2)
    expect(blockAt(blocks, 1, 'table').name).toBe('data')
  })
})

describe('table: ブロック', () => {
  it('ヘッダより深いインデントの行をタブ区切りの行としてまとめる', () => {
    const table = blockAt(body('table:data', ' a\tb', ' c\td', 'あと'), 0, 'table')
    expect(table.name).toBe('data')
    expect(table.indent).toBe(0)
    expect(table.rows.map((r) => r.cells.map((c) => c.value))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('本体が無くてもテーブルになる', () => {
    expect(blockAt(body('table:empty'), 0, 'table').rows).toEqual([])
  })

  it('セル数が揃っていなくてもそのまま保持する', () => {
    const table = blockAt(body('table:ragged', ' a\tb\tc', ' d'), 0, 'table')
    expect(table.rows.map((r) => r.cells.length)).toEqual([3, 1])
  })

  it('同じインデントの行でテーブルが終わる', () => {
    const blocks = body('table:data', ' a\tb', '通常行')
    expect(blocks).toHaveLength(2)
    expect(blockAt(blocks, 1, 'line').children).toHaveLength(1)
  })
})

describe('parseLine', () => {
  it('1 行を通常行として解析する', () => {
    const line = parseLine('  > [リンク]')
    expect(line.type).toBe('line')
    expect(line.indent).toBe(2)
    expect(line.quote).toBe(true)
    expect(stripPositions(line.children)).toEqual([
      { type: 'internalLink', label: 'リンク', target: 'リンク' },
    ])
  })

  it('origin を渡すとページ内の位置として報告する', () => {
    const line = parseLine('foo', { line: 3, offset: 42 })
    expect(line.position.start).toEqual({ line: 3, column: 0, offset: 42 })
    expect(line.children[0]?.position.start).toEqual({ line: 3, column: 0, offset: 42 })
  })

  it('parse が返す行と同じ結果になる', () => {
    const source = 'title\n  [リンク] と #tag'
    const fromPage: LineBlock = blockAt(parse(source).children, 1, 'line')
    const fromLine = parseLine('  [リンク] と #tag', { line: 1, offset: 'title\n'.length })
    expect(fromLine).toEqual(fromPage)
  })
})

describe('ブロックの境界', () => {
  it('code: と table: が続いてもそれぞれのブロックになる', () => {
    const blocks = body('code:a.ts', ' x', 'table:t', ' 1\t2', '終わり')
    expect(blocks.map((b) => b.type)).toEqual(['codeBlock', 'table', 'line'])
    expect((blocks[0] as CodeBlock).lines).toHaveLength(1)
    expect((blocks[1] as TableBlock).rows).toHaveLength(1)
  })
})
