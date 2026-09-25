/**
 * 拡張 (プラグイン) の仕様。記法を足すプラグインがこの経路だけで実装できることを保証する。
 *
 * 拡張を書く人と同じく、型は公開の入口 (`./extensions`) から取り、effect は import しない。
 * 拡張は成立しなければ null を返すだけの、普通の関数で書ける。
 */
import { describe, expect, it } from 'vitest'
import { rawTextOf } from './ast'
import type { BracketRule, Extension, InlineConstruct } from './extensions'
import { tokenizeInline } from './inline/tokenize'
import { createParser, parse, parseLine } from './parse'
import { stripPositions } from './test-helpers'
import type { LineBlock } from './types'

/** `@user` を内部リンクとして扱う拡張。新しい開始文字を持つ記法の例。 */
const mentionConstruct: InlineConstruct = (source, index) => {
  if (source[index] !== '@') return null
  const match = source.slice(index + 1).match(/^[A-Za-z0-9_-]+/)
  if (!match) return null
  const name = match[0]
  return {
    node: { type: 'internalLink', label: `@${name}`, target: name },
    length: name.length + 1,
  }
}

/** `[!foo]` を数式として扱う拡張。角括弧記法のバリエーションの例。 */
const bangRule: BracketRule = (inner) =>
  inner.startsWith('!') ? { type: 'formula', value: inner.slice(1) } : null

/**
 * `[!! 中身]` を太字にする拡張。中身を ctx.tokenize で読み直す例。
 * 中身の位置は innerOrigin から数える。
 */
const shoutRule: BracketRule = (inner, ctx) => {
  if (!inner.startsWith('!! ')) return null
  const value = inner.slice(3)
  const origin = {
    ...ctx.innerOrigin,
    column: ctx.innerOrigin.column + 3,
    offset: ctx.innerOrigin.offset + 3,
  }
  return {
    type: 'decoration',
    value,
    markers: ['!'],
    bold: true,
    italic: false,
    strike: false,
    underline: false,
    sizeLevel: 0,
    children: ctx.tokenize(value, origin, false),
  }
}

const mentions: Extension = { constructs: [mentionConstruct] }
const bang: Extension = { bracketRules: [bangRule] }

describe('拡張なし', () => {
  it('既定の記法だけが解釈される', () => {
    expect(stripPositions(tokenizeInline('@qaynam'))).toEqual([{ type: 'text', value: '@qaynam' }])
    expect(stripPositions(tokenizeInline('[!foo]'))).toEqual([
      { type: 'internalLink', label: '!foo', target: '!foo' },
    ])
  })
})

describe('construct の追加', () => {
  it('新しい記法が解釈される', () => {
    expect(stripPositions(tokenizeInline('hi @qaynam!', { extensions: [mentions] }))).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'internalLink', label: '@qaynam', target: 'qaynam' },
      { type: 'text', value: '!' },
    ])
  })

  it('既定の記法は残る', () => {
    expect(stripPositions(tokenizeInline('[リンク] @me', { extensions: [mentions] }))).toEqual([
      { type: 'internalLink', label: 'リンク', target: 'リンク' },
      { type: 'text', value: ' ' },
      { type: 'internalLink', label: '@me', target: 'me' },
    ])
  })

  it('拡張したノードにも位置情報が付く', () => {
    const source = 'hi @qaynam'
    const line: LineBlock = parseLine(source, { extensions: [mentions] })
    expect(rawTextOf(source, line.children[1]!)).toBe('@qaynam')
  })
})

describe('bracket rule の追加', () => {
  it('角括弧の中身の解釈を足せる', () => {
    expect(stripPositions(tokenizeInline('[!foo]', { extensions: [bang] }))).toEqual([
      { type: 'formula', value: 'foo' },
    ])
  })

  it('既定のルールより先に試されるので上書きできる', () => {
    // 既定では内部リンクになる `[!foo]` が数式になる。
    const overrideEverything: Extension = {
      bracketRules: [(inner) => ({ type: 'inlineCode', value: inner })],
    }
    expect(
      stripPositions(tokenizeInline('[* 太字]', { extensions: [overrideEverything] })),
    ).toEqual([{ type: 'inlineCode', value: '* 太字' }])
  })
})

describe('文脈を使う拡張', () => {
  it('ctx.tokenize で中身を読み直せ、中のノードにも正しい位置が付く', () => {
    const source = 'x [!! [リンク] だ]'
    const line = parseLine(source, { extensions: [{ bracketRules: [shoutRule] }] })
    const decoration = line.children[1]
    expect(decoration?.type).toBe('decoration')
    const link = decoration?.type === 'decoration' ? decoration.children[0] : undefined
    expect(link?.type).toBe('internalLink')
    expect(rawTextOf(source, link!)).toBe('[リンク]')
  })
})

describe('parse と createParser', () => {
  it('parse にも拡張が渡る', () => {
    const page = parse('タイトル\n@qaynam', { extensions: [mentions] })
    expect(stripPositions(page.children[1])).toMatchObject({
      type: 'line',
      children: [{ type: 'internalLink', label: '@qaynam', target: 'qaynam' }],
    })
  })

  it('createParser は拡張を固定したパーサーを返す', () => {
    const parser = createParser({ extensions: [mentions, bang] })
    expect(stripPositions(parser.parseLine('@a [!b]').children)).toEqual([
      { type: 'internalLink', label: '@a', target: 'a' },
      { type: 'text', value: ' ' },
      { type: 'formula', value: 'b' },
    ])
    expect(parser.parse('タイトル\n@a').children).toHaveLength(2)
  })
})
