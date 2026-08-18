import { describe, expect, it } from 'vitest'
import { parse, parseLine } from '../parse'
import type { AnyNode } from '../types'
import { createCompiler } from './create-compiler'
import { toPlainText } from './to-plain-text'

describe('toPlainText', () => {
  it('記法を外して読める文字列にする', () => {
    expect(toPlainText(parseLine('[* 太字] と [リンク] と `code` と #tag'))).toBe(
      '太字 と リンク と code と tag',
    )
  })

  it('装飾の中のリンクも展開する', () => {
    expect(toPlainText(parseLine('[* 自由を奪う「[牢屋]」]'))).toBe('自由を奪う「牢屋」')
  })

  it('引用とインデントを保つ', () => {
    expect(toPlainText(parseLine('  > 引用文'))).toBe('    > 引用文')
  })

  it('ページ全体を行区切りで返す', () => {
    expect(toPlainText(parse('タイトル\n[リンク]\n\n最後'))).toBe('タイトル\nリンク\n\n最後')
  })

  it('コードブロックの中身をそのまま出す', () => {
    expect(toPlainText(parse('タイトル\ncode:main.ts\n const a = 1'))).toBe(
      'タイトル\nmain.ts\nconst a = 1',
    )
  })

  it('テーブルをタブ区切りで出す', () => {
    expect(toPlainText(parse('タイトル\ntable:t\n あ\tい'))).toBe('タイトル\nt\nあ\tい')
  })
})

describe('createCompiler', () => {
  it('ハンドラを差し替えて別の出力を作れる', () => {
    const compile = createCompiler<string>({
      handlers: {
        page: (node, ctx) => ctx.children(node).join(''),
        line: (node, ctx) => `<p>${ctx.children(node).join('')}</p>`,
        title: (node) => `<h1>${node.value}</h1>`,
        text: (node) => node.value,
        internalLink: (node) => `<a href="/${node.target}">${node.label}</a>`,
      },
      fallback: (node, ctx) => ctx.children(node).join(''),
    })
    expect(compile(parse('タイトル\nこれは [リンク] です'))).toBe(
      '<h1>タイトル</h1><p>これは <a href="/リンク">リンク</a> です</p>',
    )
  })

  it('ハンドラが無いノードは fallback に回る', () => {
    const seen: string[] = []
    const compile = createCompiler<string>({
      handlers: { text: (node) => node.value },
      fallback: (node: AnyNode, ctx) => {
        seen.push(node.type)
        return ctx.children(node).join('')
      },
    })
    expect(compile(parseLine('[* 太字]'))).toBe('太字')
    expect(seen).toEqual(['line', 'decoration'])
  })
})
