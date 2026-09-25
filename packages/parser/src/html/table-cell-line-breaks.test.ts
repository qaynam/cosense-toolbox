import fc from 'fast-check'
import type { Element, ElementContent, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { tableCellNotation } from '../extensions'
import { parse } from '../parse'
import { tableCellLineBreaks } from './table-cell-line-breaks'
import { type HastOptions, toHast } from './to-hast'
import { toHtml } from './to-html'

/**
 * 表を 1 つだけ持つページを描画する。1 行目は必ずタイトルになるので、
 * 仮のタイトル `t` を置いてから表を書く。セルの中の記法はすべて読む。
 */
const tableHtml = (row: string, options: HastOptions = {}): string =>
  toHtml(parse(`t\ntable:x\n ${row}`, { extensions: [tableCellNotation()] }), options)

const withBreaks = (marker: string): HastOptions => ({ extensions: [tableCellLineBreaks(marker)] })

describe('tableCellLineBreaks', () => {
  it('セルの中の marker を <br> にする', () => {
    expect(tableHtml('1 行目\\n2 行目\tそのまま', withBreaks('\\n'))).toContain(
      '<td>1 行目<br>2 行目</td><td>そのまま</td>',
    )
  })

  it('marker が続けば <br> も続き、空の text は出さない', () => {
    const td = toHast(parse('t\ntable:x\n \\na\\n\\nb\\n'), withBreaks('\\n'))
    expect(cellsOf(td)[0]?.children).toEqual([
      { type: 'element', tagName: 'br', properties: {}, children: [] },
      { type: 'text', value: 'a' },
      { type: 'element', tagName: 'br', properties: {}, children: [] },
      { type: 'element', tagName: 'br', properties: {}, children: [] },
      { type: 'text', value: 'b' },
      { type: 'element', tagName: 'br', properties: {}, children: [] },
    ])
  })

  it('marker は文字列そのままで探し、区切った文字はエスケープする', () => {
    expect(tableHtml('a<br>b<c>.*', withBreaks('<br>'))).toContain('<td>a<br>b&lt;c>.*</td>')
  })

  it('装飾の中にも当てる', () => {
    expect(tableHtml('[* c\\nd]', withBreaks('\\n'))).toContain('<strong>c<br>d</strong>')
  })

  it('コード・数式・リンクの表示には当てない', () => {
    const html = tableHtml('`a\\nb` [$ \\nu] [x\\ny] #a\\nb', withBreaks('\\n'))
    expect(html).toContain('<code class="code">a\\nb</code>')
    expect(html).toContain('<span class="formula">\\nu</span>')
    expect(html).toContain('>x\\ny</a>')
    expect(html).toContain('>#a\\nb</a>')
  })

  it('classNames で数式の class を変えても、数式には当てない', () => {
    const classNames = { formula: 'math katex' }
    const html = tableHtml('[$ \\nu]', { ...withBreaks('\\n'), classNames })
    expect(html).toContain('<span class="math katex">\\nu</span>')
  })

  it('数式の class の一部だけを持つ要素には当てる', () => {
    const classNames = { formula: 'math katex', decoration: 'math' }
    const html = tableHtml('[* a\\nb]', { ...withBreaks('\\n'), classNames })
    expect(html).toContain('<strong>a<br>b</strong>')
  })

  it('数式の class を消しても、数式には当てない', () => {
    const html = tableHtml('[$ \\nu]', { ...withBreaks('\\n'), classNames: { formula: '' } })
    expect(html).toContain('<span>\\nu</span>')
  })

  it('handlers で数式・コード・リンクの出力を置き換えても、その中には当てない', () => {
    const span = (value: string): Element => ({
      type: 'element',
      tagName: 'span',
      properties: {},
      children: [{ type: 'text', value }],
    })
    const html = tableHtml('[$ \\nu] `a\\nb` [x\\ny]', {
      ...withBreaks('\\n'),
      handlers: {
        formula: (node) => span(node.value),
        inlineCode: (node) => span(node.value),
        internalLink: (node) => span(node.label),
      },
    })
    expect(html).toContain('<td><span>\\nu</span> <span>a\\nb</span> <span>x\\ny</span></td>')
  })

  it('セルの外には当てない', () => {
    expect(toHtml(parse('t\na\\nb'), withBreaks('\\n'))).toContain('<div class="line">a\\nb</div>')
  })

  it('marker が空文字なら何もしない', () => {
    expect(tableHtml('ab', withBreaks(''))).toContain('<td>ab</td>')
  })

  it('handlers.tableCell で置き換えた出力にも当てる', () => {
    const html = tableHtml('a\\nb', {
      ...withBreaks('\\n'),
      handlers: {
        tableCell: (node, ctx) => ({
          type: 'element',
          tagName: 'td',
          properties: { className: ['cell'] },
          children: ctx.children(node),
        }),
      },
    })
    expect(html).toContain('<td class="cell">a<br>b</td>')
  })
})

/** hast の中の `<td>` を、出てくる順に集める。 */
const cellsOf = (root: Root): Element[] => {
  const walk = (nodes: readonly (Root | ElementContent)[]): Element[] =>
    nodes.flatMap((node) =>
      node.type === 'element' && node.tagName === 'td'
        ? [node]
        : 'children' in node
          ? walk(node.children as ElementContent[])
          : [],
    )
  return walk([root])
}

/** 要素の中の文字を、`<br>` を `marker` に戻しながらつなぐ。 */
const textWithBreaksAs = (marker: string, node: ElementContent): string =>
  node.type === 'text'
    ? node.value
    : node.type === 'element'
      ? node.tagName === 'br'
        ? marker
        : node.children.map((child) => textWithBreaksAs(marker, child)).join('')
      : ''

describe('tableCellLineBreaks の不変条件', () => {
  /** 記法の断片と marker を混ぜたセル。タブは列の区切りなので入れない。 */
  const cellArb = fc
    .array(
      fc.oneof(
        fc.constantFrom('\\n', '[* 太\\n字]', '`a\\nb`', '[$ \\nu]', '[リンク]', '#tag', ' '),
        fc.string({ maxLength: 4 }).map((value) => value.replace(/[\t\n]/g, '')),
      ),
      { maxLength: 6 },
    )
    .map((parts) => parts.join(''))
  const rowArb = fc.array(cellArb, { minLength: 1, maxLength: 3 }).map((cells) => cells.join('\t'))

  const hastOf = (row: string, options: HastOptions = {}): Root =>
    toHast(parse(`t\ntable:x\n ${row}`, { extensions: [tableCellNotation()] }), options)

  it('<br> を marker に戻すと、拡張を通さないときのセルの文字と一致する', () => {
    fc.assert(
      fc.property(rowArb, (row) => {
        const broken = cellsOf(hastOf(row, withBreaks('\\n')))
        const plain = cellsOf(hastOf(row))
        expect(broken.map((td) => textWithBreaksAs('\\n', td))).toEqual(
          plain.map((td) => textWithBreaksAs('\\n', td)),
        )
      }),
    )
  })

  it('セルに無い marker を渡しても、出力は変わらない', () => {
    fc.assert(
      fc.property(rowArb, (row) => {
        expect(hastOf(row, withBreaks('\u0000'))).toEqual(hastOf(row))
      }),
    )
  })
})
