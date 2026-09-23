import { parse } from '@cosense-toolbox/parser'
import { describe, expect, it } from 'vitest'
import { type ComponentBlock, groupComponents, parseComponentTag } from './components'

describe('parseComponentTag', () => {
  it('/> で閉じたタグは自己完結のコンポーネントになる', () => {
    expect(parseComponentTag('<Counter />')).toEqual({
      name: 'Counter',
      attributes: [],
      selfClosing: true,
    })
  })

  it('文字列・JSON・値なしの属性を読む', () => {
    expect(
      parseComponentTag(`<Chart title="売上" kind='bar' data={[1, 2]} opts={{"a": "}"}} wide />`),
    ).toEqual({
      name: 'Chart',
      attributes: [
        { name: 'title', value: '売上' },
        { name: 'kind', value: 'bar' },
        { name: 'data', value: [1, 2] },
        { name: 'opts', value: { a: '}' } },
        { name: 'wide', value: true },
      ],
      selfClosing: true,
    })
  })

  it('/> で閉じないタグは children を取るコンポーネントになる', () => {
    expect(parseComponentTag('<Callout type="warn">')?.selfClosing).toBe(false)
  })

  it('小文字始まりの名前はコンポーネントにしない', () => {
    expect(parseComponentTag('<div />')).toBeNull()
  })

  it('JSON として読めない式はコンポーネントにしない', () => {
    expect(parseComponentTag('<Counter start={count + 1} />')).toBeNull()
  })

  it('行の途中にタグがあればコンポーネントにしない', () => {
    expect(parseComponentTag('ここに <Counter /> を置く')).toBeNull()
  })

  it('属性の間に空白が無ければコンポーネントにしない', () => {
    expect(parseComponentTag('<Counter a="1"b="2" />')).toBeNull()
  })

  it('閉じていない引用符があればコンポーネントにしない', () => {
    expect(parseComponentTag('<Counter a="1 />')).toBeNull()
  })
})

const group = (source: string) => groupComponents(parse(source).children, source)

describe('groupComponents', () => {
  it('より深くインデントした後続行を children に取り、深さを揃える', () => {
    const [, callout, after] = group('タイトル\n<Callout type="warn">\n 注意\n  詳しく\n後ろ')
    expect(callout?.type).toBe('component')
    const component = callout as ComponentBlock
    expect(component.children.map((block) => block.type === 'line' && block.indent)).toEqual([0, 1])
    expect(after?.type).toBe('line')
  })

  it('自己完結のタグは後続行を取らない', () => {
    const [, counter, next] = group('タイトル\n<Counter />\n 次の行')
    expect((counter as ComponentBlock).children).toEqual([])
    expect(next?.type).toBe('line')
  })

  it('children の中のコンポーネントも入れ子にまとめる', () => {
    const [, outer] = group('タイトル\n<Tabs>\n <Tab label="a">\n  中身\n <Tab label="b">\n  中身')
    const tabs = (outer as ComponentBlock).children as ComponentBlock[]
    expect(tabs.map((tab) => [tab.name, tab.children.length])).toEqual([
      ['Tab', 1],
      ['Tab', 1],
    ])
  })

  it('引用行と等幅行はコンポーネントにしない', () => {
    const blocks = group('タイトル\n><Counter />\n$ <Counter />')
    expect(blocks.map((block) => block.type)).toEqual(['title', 'line', 'line'])
  })
})
