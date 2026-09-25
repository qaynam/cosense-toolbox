import fc from 'fast-check'
import type { Element, ElementContent, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { parse, parseLine } from '../parse'
import type { AnyNode } from '../types'
import { codeLineNumbers } from './code-line-numbers'
import { type RenderExtension, toHast } from './to-hast'
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

  it('テーマの style に `:` の無い宣言が混じっていたら、その宣言だけを落とす', () => {
    const style = ' background-color : #fff ;broken; color:#111;'
    expect(toHtml(parse(SOURCE), { highlight: () => shikiOf(['a', 'b'], style) })).toContain(
      'style="--cosense-code-bg:#fff;--cosense-code-text:#111"',
    )
  })

  it.each([
    ['少ない', ['const a = 1']],
    ['多い', ['a', 'b', 'c']],
  ])('行の要素がソースの行より%s出力は、行に分けずにひと塊のまま出す', (_, lines) => {
    const html = toHtml(parse(SOURCE), { highlight: () => shikiOf(lines) })
    expect(html.match(/<code class="code-body/g)).toHaveLength(1)
  })

  it('pre の隣にほかの要素があれば、pre を剥がさずに出す', () => {
    const pre = tag('pre', [tag('code', [italic('x')])])
    expect(toHtml(parse(SOURCE), { highlight: () => [pre, italic('y')] })).toContain(
      '<code class="code-body highlight"><pre><code><i>x</i></code></pre><i>y</i></code>',
    )
  })

  it('pre > code でない入れ子は、剥がさずにそのまま出す', () => {
    const outer = tag('div', [tag('span', [italic('x')])])
    expect(toHtml(parse(SOURCE), { highlight: () => [outer] })).toContain(
      '<code class="code-body highlight"><div><span><i>x</i></span></div></code>',
    )
  })

  it('pre > code 以外の root は、その中身をそのまま code に入れる', () => {
    const root: Root = { type: 'root', children: [italic('x')] }
    expect(toHtml(parse(SOURCE), { highlight: () => root })).toContain(
      '<code class="code-body highlight"><i>x</i></code>',
    )
  })
})

/** テキスト 1 つを子に持つ要素。 */
const tag = (tagName: string, children: ElementContent[]): Element => ({
  type: 'element',
  tagName,
  properties: {},
  children,
})

describe('handlers (置き換え)', () => {
  it('ctx.children は子の変換結果を平らな配列で返す', () => {
    const html = toHtml(parseLine('[* [リンク] と 太字]'), {
      handlers: { decoration: (node, ctx) => tag('b', ctx.children(node)) },
    })
    expect(html).toBe(
      '<div class="line"><b><a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a> と 太字</b></div>',
    )
  })

  it('ctx.options には既定値を埋めたオプションが入る', () => {
    const seen: string[] = []
    toHtml(parseLine('[リンク]'), {
      classNames: { internalLink: 'my-link' },
      handlers: {
        internalLink: (node, ctx) => {
          seen.push(
            ctx.options.classNames.internalLink ?? '',
            ctx.options.pageUrl(node.target, node),
          )
          return []
        },
      },
    })
    expect(seen).toEqual(['my-link', '/%E3%83%AA%E3%83%B3%E3%82%AF'])
  })
})

describe('extensions (出力の加工)', () => {
  const SOURCE = 'タイトル\n[* 太字] と `code`'

  it('拡張はそのノード型の出力を受け取り、返した値が新しい出力になる', () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [{ inlineCode: (output) => tag('mark', output) }],
    })
    expect(html).toContain('<mark><code class="code">code</code></mark>')
  })

  it('並べた順に重なる。前の拡張の出力が次の拡張に渡る', () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [
        { inlineCode: (output) => tag('a1', output) },
        { inlineCode: (output) => tag('a2', output) },
      ],
    })
    expect(html).toContain('<a2><a1><code class="code">code</code></a1></a2>')
  })

  it('そのノード型の関数を持たない拡張は、出力に触れない', () => {
    const html = toHtml(parse(SOURCE), { extensions: [{ formula: (output) => tag('x', output) }] })
    expect(html).toBe(toHtml(parse(SOURCE)))
  })

  it('handlers で置き換えた出力を受け取る (handlers の後に動く)', () => {
    const html = toHtml(parse(SOURCE), {
      handlers: { inlineCode: (node) => tag('kbd', [{ type: 'text', value: node.value }]) },
      extensions: [{ inlineCode: (output) => tag('mark', output) }],
    })
    expect(html).toContain('<mark><kbd>code</kbd></mark>')
  })

  it('ノードと ctx も受け取るので、AST の情報を見て加工できる', () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [
        {
          decoration: (output, node, ctx) =>
            tag(node.bold ? 'section' : 'div', [
              ...output,
              { type: 'text', value: ctx.options.classNames.decoration ?? '' },
            ]),
        },
      ],
    })
    expect(html).toContain(
      '<section><span class="decoration deco-*"><strong>太字</strong></span>decoration</section>',
    )
  })

  it('子の変換 (ctx.children) にも拡張が効く', () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [{ text: (output) => tag('t', output) }],
    })
    expect(html).toContain('<strong><t>太字</t></strong>')
  })

  it('ハンドラの無い独自ノードにも、中身を出した出力に対して効く', () => {
    const custom = {
      type: 'mention',
      children: [{ type: 'text', value: 'qaynam' }],
    } as unknown as AnyNode
    const html = toHtml(custom, {
      extensions: [{ mention: (output: ElementContent[]) => tag('at', output) } as RenderExtension],
    })
    expect(html).toBe('<at>qaynam</at>')
  })

  it('拡張は raw ノードも返せる', () => {
    const html = toHtml(parse(SOURCE), {
      extensions: [{ inlineCode: () => ({ type: 'raw', value: '<kbd>raw</kbd>' }) }],
    })
    expect(html).toContain('<kbd>raw</kbd>')
  })

  it('拡張が例外を投げたら握りつぶさずに上げる (書いた人が気づけるように)', () => {
    expect(() =>
      toHtml(parse(SOURCE), {
        extensions: [
          {
            inlineCode: () => {
              throw new Error('broken extension')
            },
          },
        ],
      }),
    ).toThrow('broken extension')
  })
})

describe('extensions の不変条件', () => {
  /** コードブロックや表を含むページ。完全にランダムな文字列ではコードブロックの経路をほとんど通らない。 */
  const lineArb = fc.oneof(
    fc.constantFrom(
      '[リンク] と `code`',
      '[* 太字]',
      ' 字下げ #tag',
      'code:a.js',
      ' const a = 1',
      ' ',
      '  return <a>',
      'table:表',
      ' a\tb',
      '> 引用',
      '[user.icon*2]',
      '',
    ),
    fc.string().map((value) => value.replace(/[\r\n]/g, '')),
  )
  const sourceArb = fc
    .array(lineArb, { minLength: 1, maxLength: 12 })
    .map((lines) => ['タイトル', ...lines].join('\n'))

  /** すべてのノード型に、受け取った出力をそのまま返す拡張。 */
  const identity = new Proxy({} as RenderExtension, {
    get: () => (output: ElementContent[]) => output,
  })

  it('出力をそのまま返す拡張は、どのページの出力も変えない', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const page = parse(source)
        expect(toHtml(page, { extensions: [identity, identity] })).toBe(toHtml(page))
      }),
    )
  })

  it('codeLineNumbers は行番号の属性を足すだけで、ほかの出力を変えない', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const page = parse(source)
        const numbered = toHtml(page, { extensions: [codeLineNumbers()] })
        expect(numbered.replace(/ data-line="\d+" data-line-digits="\d+"/g, '')).toBe(toHtml(page))
      }),
    )
  })

  it('codeLineNumbers の番号は、ブロックごとに 1 から本体行の数まで欠けずに並ぶ', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const page = parse(source)
        const html = toHtml(page, { extensions: [codeLineNumbers()] })
        const expected = page.children.flatMap((block) =>
          block.type === 'codeBlock' ? block.lines.map((_, index) => String(index + 1)) : [],
        )
        expect([...html.matchAll(/data-line="(\d+)"/g)].map((match) => match[1])).toEqual(expected)
      }),
    )
  })
})
