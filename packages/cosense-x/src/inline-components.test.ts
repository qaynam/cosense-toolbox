import { type LineBlock, parse } from '@cosense-toolbox/parser'
import { describe, expect, it } from 'vitest'

import { findInlineComponents, type InlinePart } from './inline-components'

/** 2 行目 (タイトルの次の行) を読んで、インラインのコンポーネントをまとめる。 */
const inline = (text: string) => {
  const source = `タイトル\n${text}`
  const line = parse(source).children[1] as LineBlock
  const warnings: string[] = []
  const parts = findInlineComponents(line, source, { onWarning: (w) => warnings.push(w) })
  return { parts, warnings }
}

/** 位置情報を落として、種類と中身だけを見る。 */
const shape = (parts: readonly InlinePart[] | null): unknown =>
  parts?.map((part) =>
    part.type === 'inlineComponent'
      ? { component: part.name, attributes: part.attributes, children: shape(part.children) }
      : part.type === 'text'
        ? part.value
        : part.type,
  ) ?? null

describe('findInlineComponents', () => {
  it('行の途中の開始タグと閉じタグで挟んだ部分を children にする', () => {
    const { parts } = inline(
      'modalを表示させるぞ <Modal> [https://example.test/a.png] </Modal> 続き',
    )
    expect(shape(parts)).toEqual([
      'modalを表示させるぞ ',
      { component: 'Modal', attributes: [], children: [' ', 'image', ' '] },
      ' 続き',
    ])
  })

  it('自己完結のタグと属性を読む', () => {
    const { parts } = inline('新着 <Badge text="new" count={2} /> です')
    expect(shape(parts)).toEqual([
      '新着 ',
      {
        component: 'Badge',
        attributes: [
          { name: 'text', value: 'new' },
          { name: 'count', value: 2 },
        ],
        children: [],
      },
      ' です',
    ])
  })

  it('入れ子にできる', () => {
    const { parts } = inline('<A>x <B>y</B> z</A>')
    expect(shape(parts)).toEqual([
      {
        component: 'A',
        attributes: [],
        children: ['x ', { component: 'B', attributes: [], children: ['y'] }, ' z'],
      },
    ])
  })

  it('属性に URL を書いても、タグの一部として読む', () => {
    const { parts } = inline('<Link href="https://example.test/">サイト</Link>')
    expect(shape(parts)).toEqual([
      {
        component: 'Link',
        attributes: [{ name: 'href', value: 'https://example.test/' }],
        children: ['サイト'],
      },
    ])
  })

  it('インラインコードとブラケットの中のタグは読まない', () => {
    expect(inline('`<Modal>` と [<Modal>]').parts).toBeNull()
  })

  it('タグが無ければ null を返す (行の children をそのまま使う)', () => {
    expect(inline('ただの文章 [リンク]').parts).toBeNull()
  })

  it('閉じていない開始タグはテキストに戻し、警告する', () => {
    const { parts, warnings } = inline('型は Array<T> です')
    expect(shape(parts)).toEqual(['型は Array', '<T>', ' です'])
    expect(warnings).toEqual([
      '<T> が同じ行の中で閉じられていないので、テキストとして出した: 2 行目',
    ])
  })

  it('対応しない閉じタグはテキストに戻し、警告する', () => {
    const { parts, warnings } = inline('a </Modal> b')
    expect(shape(parts)).toEqual(['a ', '</Modal>', ' b'])
    expect(warnings).toHaveLength(1)
  })
})
