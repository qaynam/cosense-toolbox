import type { Element, ElementContent, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { parse, parseLine } from '../parse'
import { defaultHastHandlers, toHast } from './to-hast'
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

  it('null を返すと色付けせず、1 行ずつのまま出す', () => {
    expect(toHtml(parse(SOURCE), { highlight: () => null })).toBe(toHtml(parse(SOURCE)))
  })

  it('pre > code の形 (shiki など) なら code の中身を使い、pre の class と style を引き継ぐ', () => {
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
    expect(toHtml(parse(SOURCE), { highlight: () => shikiLike })).toContain(
      '<code class="code-body highlight shiki github-light" style="background-color:#fff;color:#24292e"><span class="line">const a = 1</span></code>',
    )
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
