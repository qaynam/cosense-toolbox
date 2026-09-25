import { parse } from '@cosense-toolbox/parser'
import { escapeHtml, tableCellLineBreaks, toHtml } from '@cosense-toolbox/parser/compile'
import { tableCellNotation } from '@cosense-toolbox/parser/extensions'
import type { Element, Root } from 'hast'
import { fromHtml } from 'hast-util-from-html'
import { toHtml as hastToHtmlRaw } from 'hast-util-to-html'
import { describe, expect, it } from 'vitest'
import fixtures from '../../parser/src/fixtures/conformance.json'
import { type ToHastOptions, toHast } from './to-hast'

/**
 * hast-util-to-html が別の版の @types/hast を見ていることがあり、`cosenseComponent` を足した
 * Root を型の上で受け付けないので、ここで吸収する。実行時には同じ形。
 */
const hastToHtml = (root: Root): string =>
  hastToHtmlRaw(root as Parameters<typeof hastToHtmlRaw>[0])

/** 属性の順序やエスケープの書き方の違いを消すため、一度 hast に読み直してから比べる。 */
const normalize = (html: string): string => hastToHtmlRaw(fromHtml(html, { fragment: true }))

const render = (source: string, options?: ToHastOptions): string =>
  hastToHtml(toHast(parse(source), options))

/** 記法をひととおり含むページ。 */
const KITCHEN_SINK = [
  'タイトル [リンク]',
  '[* 太字] [/ 斜体] [-_ 打消し下線] [** 見出し] [*/ [リンク] 入り]',
  ' インデント #タグ `code` [$ x^2]',
  '  [https://example.test ラベル] [/proj/page] [user.icon*2]',
  '> 引用 [https://gyazo.com/503a911fea542532aa5aba0a88eb7b60]',
  '$ echo 等幅',
  '[https://example.test https://x.test/a.png] [[https://x.test/b.png]]',
  '',
  'code:hello.js',
  ' const a = 1',
  '   return <a>',
  'table:表',
  ' a\tb',
  ' <c>\td',
  '[javascript:alert(1)]',
].join('\n')

describe('toHtml と同じ構造の HTML になる', () => {
  const inputs = [
    ...fixtures.inline.map((fixture) => `タイトル\n${fixture.input}`),
    ...fixtures.page.map((fixture) => fixture.input),
    KITCHEN_SINK,
  ]

  it.each(inputs)('%s', (source) => {
    const page = parse(source)
    expect(hastToHtml(toHast(page))).toBe(normalize(toHtml(page)))
  })

  it('showPads と classNames も toHtml と同じに効く', () => {
    const options = { showPads: true, classNames: { line: 'l', page: '' } } as const
    const page = parse(KITCHEN_SINK)
    expect(hastToHtml(toHast(page, options))).toBe(normalize(toHtml(page, options)))
  })

  it.each(fixtures.tableCell.map((fixture) => fixture.input))('表のセル: %s', (cell) => {
    const page = parse(`タイトル\ntable:表\n ${cell}\t[リンク]`)
    expect(hastToHtml(toHast(page))).toBe(normalize(toHtml(page)))
  })

  it('tableCellNotation で読んだセルと tableCellLineBreaks も toHtml と同じに効く', () => {
    const options = { extensions: [tableCellLineBreaks('\\n')] }
    const page = parse('タイトル\ntable:表\n [* 太\\n字] a\\n\\nb\t`c\\nd` [リンク]\\n', {
      extensions: [tableCellNotation()],
    })
    const html = hastToHtml(toHast(page, options))
    expect(html).toBe(normalize(toHtml(page, options)))
    expect(html).toContain('<br>')
  })

  it('iconImageUrl も toHtml と同じに効く', () => {
    const options = { iconImageUrl: () => 'https://x.test/icon.png' }
    const page = parse('タイトル\n[user.icon]')
    expect(hastToHtml(toHast(page, options))).toBe(normalize(toHtml(page, options)))
  })
})

describe('リンクの解決', () => {
  it('resolveLink が null を返したリンクはテキストになる', () => {
    const html = render('タイトル\n[a] #b [/p/c]', { resolveLink: () => null })
    expect(html).toBe(
      '<div class="page"><h1 class="title">タイトル</h1><div class="line">a #b /p/c</div></div>',
    )
  })

  it('resolveLink が返した label で表示テキストを差し替える', () => {
    const html = render('タイトル\n[./b.csn]', {
      resolveLink: () => ({ href: '/posts/b', label: 'B のタイトル' }),
    })
    expect(html).toContain('<a class="link" href="/posts/b">B のタイトル</a>')
  })

  it('script が動く URL を返してもリンクにしない', () => {
    const html = render('タイトル\n[a]', { resolveLink: () => ({ href: 'javascript:alert(1)' }) })
    expect(html).toContain('<div class="line">a</div>')
  })
})

describe('オプション', () => {
  it('title: false ならタイトル行を出さない', () => {
    expect(render('タイトル\n本文', { title: false })).toBe(
      '<div class="page"><div class="line">本文</div></div>',
    )
  })

  it('components を渡さなければ <Name /> の行はただのテキスト', () => {
    expect(render('タイトル\n<Counter />')).toContain('<div class="line">&#x3C;Counter /></div>')
  })

  it('components を渡すと <Name /> の行はコンポーネントのノードになる', () => {
    const source = 'タイトル\n<Callout type="warn">\n中身\n</Callout>'
    const root = toHast(parse(source), { components: { source } })
    const page = root.children[0]
    expect(page?.type === 'element' && page.children[1]).toMatchObject({
      type: 'cosenseComponent',
      name: 'Callout',
      attributes: [{ name: 'type', value: 'warn' }],
      children: [{ type: 'element', tagName: 'div', children: [{ value: '中身' }] }],
    })
  })
})

describe('コードブロックの色付け (highlight)', () => {
  const SOURCE = 'タイトル\ncode:hello.js\n const a = 1\n   return <a>'
  const italic = (code: string): Element => ({
    type: 'element',
    tagName: 'i',
    properties: {},
    children: [{ type: 'text', value: code }],
  })

  it('本体がひと塊になり、toHtml に同じ色付けを渡したときと同じ HTML になる', () => {
    const page = parse(SOURCE)
    expect(hastToHtml(toHast(page, { highlight: (code) => [italic(code)] }))).toBe(
      normalize(toHtml(page, { highlight: (code) => `<i>${escapeHtml(code)}</i>` })),
    )
  })

  it('言語名はファイル名の拡張子から、toHtml と同じ決め方で渡る', () => {
    const seen: string[] = []
    render('タイトル\ncode:Main.JAVA\n x\ncode:python\n y', {
      highlight: (_code, language) => {
        seen.push(language)
        return null
      },
    })
    expect(seen).toEqual(['java', 'python'])
  })

  it('null を返すと色付けせず、1 行ずつのまま出す', () => {
    expect(render(SOURCE, { highlight: () => null })).toBe(render(SOURCE))
  })

  it('pre > code の形 (shiki など) なら code の中身を使い、pre の class とテーマの色 (変数にして) を引き継ぐ', () => {
    const shikiLike: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          // shiki は className ではなく class を文字列で付ける。
          properties: {
            class: 'shiki github-light',
            style: 'background-color:#fff;color:#24292e',
            tabindex: '0',
          },
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { class: 'line' },
                  children: [{ type: 'text', value: 'const a = 1' }],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(render(SOURCE, { highlight: () => shikiLike })).toContain(
      '<code class="code-body highlight shiki github-light" style="--cosense-code-bg:#fff;--cosense-code-text:#24292e"><span class="line">const a = 1</span></code>',
    )
  })

  it('pre > code 以外の root は、その中身をそのまま code に入れる', () => {
    const root: Root = { type: 'root', children: [italic('x')] }
    expect(render(SOURCE, { highlight: () => root })).toContain(
      '<code class="code-body highlight"><i>x</i></code>',
    )
  })
})
