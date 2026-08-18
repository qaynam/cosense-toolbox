/**
 * 位置情報と全域性の不変条件。個別ケースでは網羅できない
 * 「装飾の中の再帰でオフセットがずれる」類のバグをここで捕まえる。
 */
import { Either } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { childrenOf, rawTextOf } from './ast'
import { parse, parseLine } from './parse'
import { decodePage } from './schema'
import { stripPositions } from './test-helpers'
import type { AnyNode, InlineNode } from './types'
import { visit } from './utils/visit'

/** 記法の断片。完全ランダムな文字列では記法の経路をほとんど通らないので組み合わせで作る。 */
const fragment = fc.oneof(
  fc.constantFrom(
    '[リンク]',
    '#tag',
    '`code`',
    '[* 太字]',
    '[- 打消し]',
    '[$ x^2]',
    '[a.icon]',
    '[a.icon*3]',
    'https://x.test/a',
    '[https://x.test/a.png]',
    '[https://x.test/a https://y.test/b.png]',
    '[[強調]]',
    '[[https://x.test/a.png]]',
    '[/proj/page]',
    '[* [内側] だ]',
    '[',
    ']',
    '[]',
    '  ',
    'あいう',
    'text',
    '#',
    '`',
  ),
  fc.string().map((s) => s.replace(/[\r\n]/g, '')),
)

const lineArb = fc.array(fragment, { maxLength: 8 }).map((parts) => parts.join(''))

const prefixArb = fc.constantFrom('', ' ', '  ', '\t', '> ', '>', '$ ', '　')

const contentLineArb = fc.tuple(prefixArb, lineArb).map(([prefix, body]) => `${prefix}${body}`)

const sourceArb = fc
  .array(contentLineArb, { minLength: 1, maxLength: 6 })
  .map((lines) => lines.join('\n'))

describe('全域性', () => {
  it('どんな入力でも例外を投げずに Page を返す', () => {
    fc.assert(
      fc.property(fc.string(), (source) => {
        expect(parse(source).type).toBe('page')
      }),
    )
  })
})

describe('位置情報', () => {
  it('すべてのノードの範囲がソースの中に収まる', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const normalized = source
        visit(parse(normalized), (node) => {
          expect(node.position.start.offset).toBeGreaterThanOrEqual(0)
          expect(node.position.end.offset).toBeLessThanOrEqual(normalized.length)
          expect(node.position.end.offset).toBeGreaterThanOrEqual(node.position.start.offset)
        })
      }),
    )
  })

  it('子の範囲は親の範囲に収まる', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const check = (node: AnyNode) => {
          for (const child of childrenOf(node)) {
            expect(child.position.start.offset).toBeGreaterThanOrEqual(node.position.start.offset)
            expect(child.position.end.offset).toBeLessThanOrEqual(node.position.end.offset)
            check(child)
          }
        }
        check(parse(source))
      }),
    )
  })

  it('行の子ノードは重なりも隙間もなく本文を覆う', () => {
    fc.assert(
      fc.property(contentLineArb, (text) => {
        const line = parseLine(text)
        const children = line.children
        if (children.length === 0) return

        for (const [index, child] of children.entries()) {
          const previous = children[index - 1]
          if (previous) expect(child.position.start.offset).toBe(previous.position.end.offset)
        }
        const first = children[0]
        const last = children[children.length - 1]
        expect(last?.position.end.offset).toBe(line.position.end.offset)
        expect(children.map((n) => rawTextOf(text, n)).join('')).toBe(
          text.slice(first?.position.start.offset ?? 0),
        )
      }),
    )
  })

  it('装飾の子ノードもソース上の生テキストと一致する', () => {
    fc.assert(
      fc.property(contentLineArb, (text) => {
        visit(parseLine(text), 'decoration', (decoration) => {
          for (const child of decoration.children) {
            expect(rawTextOf(text, child)).toBe(
              text.slice(child.position.start.offset, child.position.end.offset),
            )
          }
          expect(decoration.children.map((n) => rawTextOf(text, n)).join('')).toBe(decoration.value)
        })
      }),
    )
  })
})

describe('ラウンドトリップ', () => {
  it('記法ノードの生テキストを単体で解析すると同じノードになる', () => {
    // text ノードは前後の文脈で意味が変わりうる (`[a]#tag` の `#tag` など) ので対象外。
    fc.assert(
      fc.property(lineArb, (text) => {
        for (const node of parseLine(text).children) {
          if (node.type === 'text') continue
          const raw = rawTextOf(text, node)
          const reparsed = parseLine(raw).children
          expect(reparsed).toHaveLength(1)
          expect(stripPositions(reparsed[0] as InlineNode)).toEqual(stripPositions(node))
        }
      }),
    )
  })
})

describe('parse と parseLine の整合', () => {
  it('ページの中の行と単独でパースした行が一致する', () => {
    fc.assert(
      fc.property(contentLineArb, (text) => {
        const source = `タイトル\n${text}`
        const fromPage = parse(source).children[1]
        if (fromPage?.type !== 'line') return
        expect(parseLine(text, { line: 1, offset: 'タイトル\n'.length })).toEqual(fromPage)
      }),
    )
  })
})

describe('Schema との整合', () => {
  it('parse の出力は常に PageSchema を通る', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const decoded = decodePage(JSON.parse(JSON.stringify(parse(source))))
        expect(Either.isRight(decoded)).toBe(true)
      }),
    )
  })
})
