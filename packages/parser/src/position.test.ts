/**
 * 位置情報の仕様。ノードの position はその記法の生テキスト全体 (マーカーを含む) を指し、
 * `source.slice(start.offset, end.offset)` で必ず復元できる。
 */
import { describe, expect, it } from 'vitest'
import { rawTextOf } from './ast'
import { parse, parseLine } from './parse'
import { at } from './test-helpers'
import type { Decoration } from './types'
import { collect, visit } from './utils/visit'

describe('インラインノードの位置', () => {
  it('テキストと内部リンクがそれぞれの範囲を指す', () => {
    const source = 'see [React Native] here'
    const line = parseLine(source)
    expect(line.children.map((n) => n.position)).toEqual([
      at(source, 'see '),
      at(source, '[React Native]'),
      at(source, ' here'),
    ])
  })

  it('記法のマーカーを含めた範囲を指す', () => {
    const source = '`code` #tag [$ x^2] [a.icon]'
    const line = parseLine(source)
    expect(line.children.map((n) => rawTextOf(source, n))).toEqual([
      '`code`',
      ' ',
      '#tag',
      ' ',
      '[$ x^2]',
      ' ',
      '[a.icon]',
    ])
  })

  it('装飾の子ノードはソース全体から見た絶対位置を持つ', () => {
    const source = 'x [* [リンク]ですね] y'
    const decoration = parseLine(source).children[1] as Decoration
    expect(decoration.position).toEqual(at(source, '[* [リンク]ですね]'))
    expect(decoration.children.map((n) => rawTextOf(source, n))).toEqual(['[リンク]', 'ですね'])
  })

  it('[[...]] の中の子ノードも絶対位置を持つ', () => {
    const source = '[[強調と [リンク] だ]]'
    const decoration = parseLine(source).children[0] as Decoration
    expect(decoration.children.map((n) => rawTextOf(source, n))).toEqual([
      '強調と ',
      '[リンク]',
      ' だ',
    ])
  })

  it('引用行では記号を除いた本文の位置になる', () => {
    const source = '> [リンク]'
    const line = parseLine(source)
    expect(line.position).toEqual(at(source, '> [リンク]'))
    expect(line.children[0]?.position).toEqual(at(source, '[リンク]'))
  })

  it('インデントぶんだけ column と offset が進む', () => {
    const source = '  [リンク]'
    const line = parseLine(source)
    expect(line.children[0]?.position.start).toEqual({ line: 0, column: 2, offset: 2 })
  })
})

describe('ページ全体の位置', () => {
  const source = ['タイトル', '一行目', '  [リンク] です'].join('\n')

  it('行番号とページ全体のオフセットが両方入る', () => {
    const page = parse(source)
    const link = collect(page, 'internalLink')[0]
    expect(link?.position).toEqual(at(source, '[リンク]'))
    expect(link?.position.start).toEqual({
      line: 2,
      column: 2,
      offset: source.indexOf('[リンク]'),
    })
  })

  it('ページの position がソース全体を覆う', () => {
    const page = parse(source)
    expect(rawTextOf(source, page)).toBe(source)
  })

  it('すべてのノードで slice が生テキストと一致する', () => {
    const page = parse(source)
    visit(page, (node) => {
      expect(rawTextOf(source, node)).toBe(
        source.slice(node.position.start.offset, node.position.end.offset),
      )
      expect(node.position.end.offset).toBeGreaterThanOrEqual(node.position.start.offset)
    })
  })
})

describe('ブロックの位置', () => {
  it('コードブロックはヘッダから最終行までを覆う', () => {
    const source = ['タイトル', 'code:main.ts', ' const a = 1', ' const b = 2', '外'].join('\n')
    const page = parse(source)
    const code = page.children[1]
    expect(rawTextOf(source, code!)).toBe('code:main.ts\n const a = 1\n const b = 2')
  })

  it('本体が無いコードブロックはヘッダ行だけを覆う', () => {
    const source = 'タイトル\ncode:empty.txt'
    expect(rawTextOf(source, parse(source).children[1]!)).toBe('code:empty.txt')
  })

  it('テーブルのセルは行内の自分の範囲を指す', () => {
    const source = ['タイトル', 'table:data', ' あ\tい\tう'].join('\n')
    const page = parse(source)
    const cells = collect(page, 'tableCell')
    expect(cells.map((c) => rawTextOf(source, c))).toEqual(['あ', 'い', 'う'])
  })
})

describe('parseLine の origin', () => {
  it('origin を渡すとページ内の位置として報告する', () => {
    const source = 'タイトル\n  [リンク]'
    const offset = source.indexOf('  [リンク]')
    const line = parseLine('  [リンク]', { line: 1, offset })
    expect(line.children[0]?.position).toEqual(at(source, '[リンク]'))
  })
})
