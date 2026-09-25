import { describe, expect, it } from 'vitest'

import { extractStyles } from './extract'

/** 抜き出したルールのセレクタを、出てきた順に並べる。 */
const order = (css: string): string[] =>
  extractStyles(css).rules.map(({ selector }) => selector.body + selector.pseudo)

describe('extractStyles', () => {
  it('ルールは元の詳細度の低い順に並べる。同じ詳細度なら書いた順', () => {
    const css = `
      .page .a.b { color: red }
      .page .c { color: red }
      .page .d { color: red }
      .page .e .f { color: red }
    `
    expect(order(css)).toEqual(['.c', '.d', '.a.b', '.e .f'])
  })

  it('セレクタを並べたルールは、セレクタごとの詳細度で別々に並べる', () => {
    const css = `
      .page .a.b, .page .c { color: red }
      .page .d { padding: 0 }
    `
    expect(order(css)).toEqual(['.c', '.d', '.a.b'])
    expect(extractStyles(css).rules[0]?.declarations).toEqual({ color: 'red' })
  })

  it('要素名・擬似要素・擬似クラス・属性・:has() / :not() の中身を詳細度に数える', () => {
    const css = `
      .page .line.code-block > code { color: red }
      .page .line[data-indent]::before { color: red }
      .page .line:has(> .indent-mark)::before { color: red }
      .page .line.code-block:not(:has(> .code-start))::before { color: red }
      .page .table td:nth-child(odd) { color: red }
      .page .x:where(.y .z) { color: red }
    `
    // .page を含めた詳細度は、.x:where() が (0,2,0)、:not(:has())::before が (0,4,1)、
    // 残りの 4 つがどれも (0,3,1)。同じ詳細度のものは書いた順のまま。
    expect(order(css)).toEqual([
      '.x:where(.y .z)',
      '.line.code-block > code',
      '.line[data-indent]::before',
      '.line:has(> .indent-mark)::before',
      '.table td:nth-child(odd)',
      '.line.code-block:not(:has(> .code-start))::before',
    ])
  })

  it('同じセレクタのルールが 2 つあっても、両方を書いた順に残す', () => {
    const css = `
      .page .a { color: red }
      .page .a { padding: 0 }
    `
    expect(extractStyles(css).rules.map(({ declarations }) => declarations)).toEqual([
      { color: 'red' },
      { padding: '0' },
    ])
  })

  it('.page の子孫でないセレクタや、トップレベルの at-rule はエラーにする', () => {
    expect(() => extractStyles('.other .a { color: red }')).toThrow(/\.page の下にない/)
    expect(() => extractStyles('.page > .a { color: red }')).toThrow(/子孫/)
    expect(() => extractStyles('@media print { .page .a { color: red } }')).toThrow(/media/)
  })
})
