import type { AstroConfig } from 'astro'
import type { Element, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { astroShikiHighlighter, codeLanguagesIn } from './highlight'

type MarkdownConfig = AstroConfig['markdown']

/** Astro の既定に近い Markdown の設定。 */
const markdownOf = (
  overrides: {
    syntaxHighlight?: MarkdownConfig['syntaxHighlight']
    shikiConfig?: Partial<MarkdownConfig['shikiConfig']>
  } = {},
): MarkdownConfig =>
  ({
    syntaxHighlight: overrides.syntaxHighlight ?? { type: 'shiki', excludeLangs: ['math'] },
    shikiConfig: {
      langs: [],
      langAlias: {},
      theme: 'github-light',
      themes: {},
      wrap: false,
      transformers: [],
      ...overrides.shikiConfig,
    },
  }) as unknown as MarkdownConfig

const PAGE = [
  'タイトル',
  'code:hello.js',
  ' const a = 1',
  '箇条書き',
  ' code:Main.ts',
  '  x',
  'code:hello.js',
].join('\n')

const preOf = (result: Root | unknown): Element | undefined => {
  const first = (result as Root | null)?.children?.[0]
  return first?.type === 'element' ? first : undefined
}

describe('codeLanguagesIn', () => {
  it('字下げしたものも含め、コードブロックの言語名を重ねずに集める', () => {
    expect(codeLanguagesIn(PAGE)).toEqual(['js', 'ts'])
  })
})

describe('astroShikiHighlighter', () => {
  it('shiki を使わない設定なら色付けしない', () => {
    expect(astroShikiHighlighter(markdownOf({ syntaxHighlight: false }))).toBeUndefined()
    expect(astroShikiHighlighter(markdownOf({ syntaxHighlight: 'prism' }))).toBeUndefined()
  })

  it('ページに出てくる言語を読み込み、shiki の hast を返す', async () => {
    const highlight = await astroShikiHighlighter(markdownOf())?.prepare(PAGE)
    const pre = preOf(highlight?.('const a = 1', 'js'))
    expect(pre?.tagName).toBe('pre')
    expect(String(pre?.properties.class)).toContain('github-light')
  })

  it('知らない言語と excludeLangs の言語は色付けしない', async () => {
    const source = 'タイトル\ncode:a.unknownlang\n x\ncode:b.math\n y'
    const highlight = await astroShikiHighlighter(markdownOf())?.prepare(source)
    expect(highlight?.('x', 'unknownlang')).toBeNull()
    expect(highlight?.('y', 'math')).toBeNull()
  })

  it('langAlias で言語名を読み替える', async () => {
    const markdown = markdownOf({ shikiConfig: { langAlias: { mylang: 'python' } } })
    const highlight = await astroShikiHighlighter(markdown)?.prepare('t\ncode:a.mylang\n pass')
    expect(preOf(highlight?.('pass', 'mylang'))?.tagName).toBe('pre')
  })

  it('toHtml 向けには pre と code を含まない HTML を返す', async () => {
    const highlight = await astroShikiHighlighter(markdownOf())?.prepareHtml?.(PAGE)
    const html = highlight?.('const a = 1', 'js') ?? ''
    expect(html).toContain('<span style="color:')
    expect(html).not.toContain('<pre')
    expect(highlight?.('<b>', 'unknownlang')).toBe('&lt;b&gt;')
  })
})
