import type { Element, ElementContent, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { parse, parseLine } from '../parse'
import { codeLineNumbers, defaultHastHandlers, toHast } from './to-hast'
import { toHtml } from './to-html'

const italic = (value: string): Element => ({
  type: 'element',
  tagName: 'i',
  properties: {},
  children: [{ type: 'text', value }],
})

/** hast の木の先頭の要素。 */
const first = (root: Root): ElementContent | undefined => root.children[0] as ElementContent

describe('toHast', () => {
  it('ページは div.page を根に持つ hast になる', () => {
    expect(toHast(parse('タイトル'))).toEqual({
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['page'] },
          children: [
            {
              type: 'element',
              tagName: 'h1',
              properties: { className: ['title'] },
              children: [{ type: 'text', value: 'タイトル' }],
            },
          ],
        },
      ],
    })
  })

  it('ページ以外のノードも hast にできる', () => {
    expect(first(toHast(parseLine('`x`')))).toMatchObject({
      tagName: 'div',
      properties: { className: ['line'] },
    })
  })
})

describe('コードブロックの色付け (highlight)', () => {
  const SOURCE = 'タイトル\ncode:hello.js\n const a = 1\n   return <a>'

  it('本体がひと塊になり、言語名がファイル名の拡張子から渡る', () => {
    const seen: string[] = []
    const html = toHtml(parse(SOURCE), {
      highlight: (code, language) => {
        seen.push(language)
        return [italic(code)]
      },
    })
    expect(seen).toEqual(['js'])
    expect(html).toContain(
      '<code class="code-body highlight"><i>const a = 1\n  return &lt;a></i></code>',
    )
  })

  it('ハイライタが例外を投げたら、そのブロックは色付けせず 1 行ずつのまま出す', () => {
    // shiki は読み込んでいない言語で例外を投げる。1 つのブロックのためにページ全体を落とさない。
    const html = toHtml(parse(SOURCE), {
      highlight: () => {
        throw new Error('unknown language')
      },
    })
    expect(html).toBe(toHtml(parse(SOURCE)))
  })

  it('null を返すと色付けせず、1 行ずつのまま出す', () => {
    expect(toHtml(parse(SOURCE), { highlight: () => null })).toBe(toHtml(parse(SOURCE)))
  })

  /** shiki の codeToHast と同じ形。行ごとの span.line を改行のテキストでつなぐ。 */
  const shikiOf = (lines: string[], style = 'background-color:#fff;color:#24292e'): Root => ({
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        // shiki は className ではなく class を文字列で付ける。
        properties: { class: 'shiki github-light', style, tabindex: '0' },
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: {},
            children: lines.flatMap((value, index): ElementContent[] => [
              ...(index === 0 ? [] : [{ type: 'text' as const, value: '\n' }]),
              {
                type: 'element',
                tagName: 'span',
                properties: { class: 'line' },
                children: [{ type: 'text', value }],
              },
            ]),
          },
        ],
      },
    ],
  })

  it('shiki のように行ごとに分かれた出力は、色付けしないときと同じく 1 行ずつの要素に入れ直す', () => {
    const html = toHtml(parse(SOURCE), {
      highlight: () => shikiOf(['const a = 1', '  return <a>']),
    })
    const open =
      '<div class="line code-block" data-indent="1"><code class="code-body highlight shiki github-light" style="--cosense-code-bg:#fff;--cosense-code-text:#24292e">'
    expect(html).toContain(
      `${open}<span class="line">const a = 1</span></code></div>${open}<span class="line">  return &lt;a></span></code></div>`,
    )
  })

  it('テーマの背景色と文字色は style.css の変数にして渡し、ほかの変数はそのまま残す', () => {
    const style = 'background-color:#fff;--shiki-dark-bg:#000;color:#111;--shiki-dark:#eee'
    expect(toHtml(parse(SOURCE), { highlight: () => shikiOf(['a', 'b'], style) })).toContain(
      'style="--cosense-code-bg:#fff;--shiki-dark-bg:#000;--cosense-code-text:#111;--shiki-dark:#eee"',
    )
  })

  it('行の数が合わない出力は、行に分けずにひと塊のまま出す', () => {
    const html = toHtml(parse(SOURCE), { highlight: () => shikiOf(['const a = 1']) })
    expect(html.match(/<code class="code-body/g)).toHaveLength(1)
  })

  it('pre > code 以外の root は、その中身をそのまま code に入れる', () => {
    const root: Root = { type: 'root', children: [italic('x')] }
    expect(toHtml(parse(SOURCE), { highlight: () => root })).toContain(
      '<code class="code-body highlight"><i>x</i></code>',
    )
  })
})

describe('既定のハンドラを包む', () => {
  it('defaultHastHandlers はオプションを ctx から読むので、包むときにオプションを渡し直さなくてよい', () => {
    const html = toHtml(parseLine('[リンク]'), {
      pageUrl: (title) => `/wiki/${title}`,
      handlers: {
        internalLink: (node, ctx) => ({
          type: 'element',
          tagName: 'mark',
          properties: {},
          children: defaultHastHandlers.internalLink(node, ctx),
        }),
      },
    })
    expect(html).toBe(
      '<div class="line"><mark><a class="link" href="/wiki/リンク">リンク</a></mark></div>',
    )
  })

  it('ctx.children は子の変換結果を平らな配列で返す', () => {
    const html = toHtml(parseLine('[* [リンク] と 太字]'), {
      handlers: {
        decoration: (node, ctx) => ({
          type: 'element',
          tagName: 'b',
          properties: {},
          children: ctx.children(node),
        }),
      },
    })
    expect(html).toBe(
      '<div class="line"><b><a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a> と 太字</b></div>',
    )
  })
})

describe('codeLineNumbers', () => {
  const SOURCE = 'タイトル\ncode:a.js\n one\n two'
  const numbers = (html: string): string[] =>
    [...html.matchAll(/<div class="line code-block"[^>]*data-line="(\d+)"/g)].map((m) => m[1] ?? '')

  it('コードブロックの本体行に、1 から数えた data-line を付ける。ヘッダ行には付けない', () => {
    const html = toHtml(parse(SOURCE), { handlers: codeLineNumbers() })
    expect(numbers(html)).toEqual(['1', '2'])
    expect(html).toContain('<div class="line code-block"><code class="code-start">')
  })

  it('色付けして 1 行ずつに入れ直したブロックにも付く', () => {
    const html = toHtml(parse(SOURCE), {
      handlers: codeLineNumbers(),
      highlight: (code) =>
        code.split('\n').map((value) => ({
          type: 'element' as const,
          tagName: 'span',
          properties: { className: ['line'] },
          children: [{ type: 'text' as const, value }],
        })),
    })
    expect(numbers(html)).toEqual(['1', '2'])
  })

  it('ひと塊にまとめたブロックには付けない (行と番号が対応しないため)', () => {
    const html = toHtml(parse(SOURCE), {
      handlers: codeLineNumbers(),
      highlight: (code) => [italic(code)],
    })
    expect(numbers(html)).toEqual([])
  })
})
