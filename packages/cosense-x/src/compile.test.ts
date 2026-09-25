import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { codeLineNumbers, tableCellLineBreaks } from '@cosense-toolbox/parser/compile'
import { tableCellNotation } from '@cosense-toolbox/parser/extensions'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { type CompileOptions, compile } from './compile'
import { createIndex } from './links'

/**
 * 生成したモジュールを実際に import する。`react/jsx-runtime` を解決できるよう、
 * このパッケージの node_modules の下に書き出す。
 */
const CACHE_DIR = join(import.meta.dirname, '..', 'node_modules', '.cache', 'cosense-x-test')
let counter = 0

// biome-ignore lint/suspicious/noExplicitAny: 生成したモジュールの形は実行するまで分からない
const load = async (code: string): Promise<any> => {
  await mkdir(CACHE_DIR, { recursive: true })
  const file = join(CACHE_DIR, `module-${process.pid}-${counter++}.mjs`)
  await writeFile(file, code)
  return import(file)
}

const renderPage = async (
  source: string,
  options: CompileOptions = {},
  props: Record<string, unknown> = {},
): Promise<string> => {
  const { code } = await compile(source, options)
  const module = await load(code)
  return renderToStaticMarkup(createElement(module.default, props))
}

describe('compile', () => {
  it('React で描画すると toHtml と同じ構造の HTML になる', async () => {
    expect(await renderPage('タイトル\n[* 太字] と [リンク]\n\n code')).toBe(
      '<div class="page"><h1 class="title">タイトル</h1>' +
        '<div class="line"><span class="decoration deco-*"><strong>太字</strong></span> と <a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a></div>' +
        '<div class="line"><br/></div>' +
        '<div class="line" data-indent="1">code</div></div>',
    )
  })

  it('frontmatter と metadata を export する', async () => {
    const source = '---\nslug: hello\n---\nタイトル\ncode:frontmatter.yml\n draft: true\n本文 #タグ'
    const { code, frontmatter, metadata } = await compile(source)
    const module = await load(code)
    expect(frontmatter).toEqual({ slug: 'hello', draft: true })
    expect(module.frontmatter).toEqual(frontmatter)
    expect(module.metadata).toEqual(metadata)
    expect(metadata).toMatchObject({
      title: 'タイトル',
      slug: 'hello',
      description: '本文 タグ',
      tags: ['タグ'],
      draft: true,
    })
  })

  it('code:frontmatter.yml ブロックは描画しない', async () => {
    const html = await renderPage('タイトル\ncode:frontmatter.yml\n draft: true\n本文')
    expect(html).not.toContain('frontmatter')
  })

  it('jsxImportSource に合わせて import 元と属性名の書き方が変わる', async () => {
    const { code } = await compile('タイトル', { jsxImportSource: 'astro' })
    expect(code).toContain('from "astro/jsx-runtime"')
    expect(code).toContain('class: "page"')
  })

  it('props.components で要素を差し替えられる', async () => {
    const a = (props: { href: string; children: unknown }) =>
      createElement('a', { href: props.href, 'data-custom': '' }, props.children as string)
    const html = await renderPage('タイトル\n[リンク]', {}, { components: { a } })
    expect(html).toContain('<a href="/%E3%83%AA%E3%83%B3%E3%82%AF" data-custom="">リンク</a>')
  })
})

describe('.csnx のコンポーネント', () => {
  const Callout = (props: { type: string; count: number; children?: unknown }) =>
    createElement(
      'aside',
      { 'data-type': props.type, 'data-count': props.count },
      props.children as string,
    )

  it('コンポーネントに属性と、開始タグから閉じタグまでの行を children として渡す', async () => {
    const source = 'タイトル\n<Callout type="warn" count={2}>\n注意\n</Callout>\n後ろ'
    const html = await renderPage(source, { format: 'csnx' }, { components: { Callout } })
    expect(html).toContain(
      '<aside data-type="warn" data-count="2"><div class="line">注意</div></aside><div class="line">後ろ</div>',
    )
  })

  it('コンポーネントが渡されなければ、元の行をテキストとして出す', async () => {
    const html = await renderPage('タイトル\n<Missing a="1" />', { format: 'csnx' })
    expect(html).toContain('<div class="line">&lt;Missing a=&quot;1&quot; /&gt;</div>')
  })

  it('中身のあるコンポーネントが渡されなければ、開始タグ・中身・閉じタグの行をそのまま出す', async () => {
    const html = await renderPage('タイトル\n<Missing>\n中身\n</Missing>', { format: 'csnx' })
    expect(html).toContain(
      '<div class="line">&lt;Missing&gt;</div><div class="line">中身</div><div class="line">&lt;/Missing&gt;</div>',
    )
  })

  it('閉じタグが無ければコンパイルが失敗する。行番号はファイル先頭の YAML も数える', async () => {
    await expect(
      compile('---\r\ndate: 2026-01-01\r\n---\r\nタイトル\r\n<Callout>\r\n中身', {
        format: 'csnx',
      }),
    ).rejects.toThrow(/<Callout> が閉じられていない: 5 行目/)
  })

  it('行の途中の開始タグと閉じタグで挟んだ部分をコンポーネントにする', async () => {
    const Modal = (props: { children?: unknown }) =>
      createElement('dialog', { open: true }, props.children as string)
    const html = await renderPage(
      'タイトル\nmodalを表示させるぞ <Modal>[https://example.test/a.png]</Modal> 続き',
      { format: 'csnx' },
      { components: { Modal } },
    )
    expect(html).toContain(
      '<div class="line">modalを表示させるぞ <dialog open=""><img class="image" src="https://example.test/a.png" alt=""/></dialog> 続き</div>',
    )
  })

  it('行の途中のコンポーネントが渡されなければ、タグもテキストとして出す', async () => {
    const html = await renderPage('タイトル\na <Missing>b</Missing> c', { format: 'csnx' })
    expect(html).toContain('<div class="line">a &lt;Missing&gt;b&lt;/Missing&gt; c</div>')
  })

  it('行の途中の閉じていないタグはテキストのまま出し、warnings に積む', async () => {
    const result = await compile('タイトル\n型は Array<T> です', { format: 'csnx' })
    expect(result.warnings).toEqual([
      '<T> が同じ行の中で閉じられていないので、テキストとして出した: 2 行目',
    ])
    const html = await renderPage('タイトル\n型は Array<T> です', { format: 'csnx' })
    expect(html).toContain('<div class="line">型は Array&lt;T&gt; です</div>')
  })

  it('行の途中のタグは説明文に入れない', async () => {
    const { metadata } = await compile('タイトル\n新着 <Badge text="new" /> です', {
      format: 'csnx',
    })
    expect(metadata.description).toBe('新着 です')
  })

  it('.csn では <Name /> の行をコンポーネントにしない', async () => {
    const html = await renderPage(
      'タイトル\n<Callout />',
      { format: 'csn' },
      { components: { Callout } },
    )
    expect(html).not.toContain('<aside')
  })

  it('形式を省くと filePath の拡張子で決める', async () => {
    const html = await renderPage(
      'タイトル\n<Callout type="a" count={1} />',
      { filePath: 'posts/a.csnx' },
      { components: { Callout } },
    )
    expect(html).toContain('<aside data-type="a" data-count="1"></aside>')
  })

  it('コンポーネントの開始タグと閉じタグの行は説明文に入れない', async () => {
    const { metadata } = await compile('タイトル\n<Counter />\n<Callout>\n本文\n</Callout>', {
      format: 'csnx',
    })
    expect(metadata.description).toBe('本文')
  })
})

describe('リンクの解決', () => {
  const index = createIndex([
    { id: 'posts/a.csn', title: 'Page A', slug: 'page-a' },
    { id: 'posts/notes/b.csnx', title: 'Page B', slug: 'page-b' },
    { id: 'posts/draft.csn', title: '下書き', slug: 'draft', draft: true },
  ])
  const base: CompileOptions = {
    index,
    filePath: 'posts/a.csn',
    pageUrl: (page) => `/blog/${page.slug}`,
  }

  it('タイトルで書いたリンクは索引で引く。大文字小文字と _ の違いは無視する', async () => {
    const html = await renderPage('タイトル\n[page_b]', base)
    expect(html).toContain('<a class="link" href="/blog/page-b">page_b</a>')
  })

  it('相対パスで書いたリンクはファイルを指し、表示はリンク先のタイトルになる', async () => {
    const html = await renderPage('タイトル\n[./notes/b.csnx]', base)
    expect(html).toContain('<a class="link" href="/blog/page-b">Page B</a>')
  })

  it('索引に無いページと draft のページへのリンクは、既定ではテキストになる', async () => {
    const html = await renderPage('タイトル\n[無いページ] [下書き]', base)
    expect(html).toContain('<div class="line">無いページ 下書き</div>')
  })

  it("unresolved: 'link' なら索引に無くてもリンクにする", async () => {
    const html = await renderPage('タイトル\n[無いページ]', { ...base, unresolved: 'link' })
    expect(html).toContain('<a class="link" href="/blog/無いページ">無いページ</a>')
  })

  it("unresolved: 'warn' ならリンク切れを warnings に積む", async () => {
    const result = await compile('タイトル\n[無いページ] [./none.csn]', {
      ...base,
      unresolved: 'warn',
    })
    expect(result.warnings).toEqual([
      'リンク先のページが見つからない: [無いページ] (posts/a.csn)',
      'リンク先のページが見つからない: [./none.csn] (posts/a.csn)',
    ])
  })

  it("unresolved: 'error' ならコンパイルが失敗する", async () => {
    await expect(
      compile('タイトル\n[無いページ]', { ...base, unresolved: 'error' }),
    ).rejects.toThrow(/無いページ/)
  })

  it('tagUrl を渡すとタグはその URL になる', async () => {
    const html = await renderPage('タイトル\n#日記', { ...base, tagUrl: (tag) => `/tags/${tag}` })
    expect(html).toContain('<a class="hashtag" href="/tags/日記">#日記</a>')
  })

  it('別プロジェクトへのリンクは既定で scrapbox.io を指す', async () => {
    const html = await renderPage('タイトル\n[/help-jp/ページ の 作り方]', base)
    expect(html).toContain(
      'href="https://scrapbox.io/help-jp/%E3%83%9A%E3%83%BC%E3%82%B8_%E3%81%AE_%E4%BD%9C%E3%82%8A%E6%96%B9"',
    )
  })

  it('説明文でも、相対パスのリンクはリンク先のタイトルになる', async () => {
    const { metadata } = await compile('タイトル\n参照: [./notes/b.csnx] と [./none.csn]', base)
    expect(metadata.description).toBe('参照: Page B と ./none.csn')
  })

  it('索引を渡さなければ、タイトルのリンクはすべてページへのリンクになる', async () => {
    const html = await renderPage('タイトル\n[どこか]', { pageUrl: (page) => `/p/${page.slug}` })
    expect(html).toContain('<a class="link" href="/p/どこか">どこか</a>')
  })
})

describe('rehype プラグイン', () => {
  it('hast に当ててから JS にする', async () => {
    const addLang = () => (tree: { children: { properties?: Record<string, unknown> }[] }) => {
      const first = tree.children[0]
      if (first?.properties) first.properties.lang = 'ja'
    }
    const html = await renderPage('タイトル', { rehypePlugins: [addLang] })
    expect(html).toContain('<div class="page" lang="ja">')
  })
})

describe('renderOptions (parser の toHast に渡る描画の設定)', () => {
  const SOURCE = 'タイトル\n[https://x.test/a.png] と `code` と [リンク]\ncode:a.ts\n const a = 1'

  it('highlight が返した要素を JS にして描画する', async () => {
    const html = await renderPage(SOURCE, {
      renderOptions: {
        highlight: (code, language) => [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: [`token-${language}`] },
            children: [{ type: 'text', value: code }],
          },
        ],
      },
    })
    expect(html).toContain(
      '<code class="code-body highlight"><span class="token-ts">const a = 1</span></code>',
    )
  })

  it('handlers で記法ごとの出力を置き換えられる', async () => {
    const html = await renderPage(SOURCE, {
      renderOptions: {
        handlers: {
          inlineCode: (node) => ({
            type: 'element',
            tagName: 'kbd',
            properties: {},
            children: [{ type: 'text', value: node.value }],
          }),
        },
      },
    })
    expect(html).toContain('<kbd>code</kbd>')
  })

  it('extensions は cosense-x の描画 (リンクの解決を含む) の出力を受け取って加工する', async () => {
    const html = await renderPage(SOURCE, {
      pageUrl: (page) => `/p/${page.slug}`,
      index: createIndex([{ id: 'a.csn', title: 'リンク', slug: 'link' }]),
      renderOptions: {
        extensions: [
          {
            internalLink: (output) => ({
              type: 'element',
              tagName: 'mark',
              properties: {},
              children: output,
            }),
          },
        ],
      },
    })
    expect(html).toContain('<mark><a class="link" href="/p/link">リンク</a></mark>')
  })

  it('codeLineNumbers で本体行に行番号が付く', async () => {
    const html = await renderPage(SOURCE, { renderOptions: { extensions: [codeLineNumbers()] } })
    expect(html).toContain('data-line="1" data-line-digits="1"')
  })

  it('classNames と title も renderOptions で渡す', async () => {
    const html = await renderPage(SOURCE, {
      renderOptions: { title: false, classNames: { inlineCode: 'my-code' } },
    })
    expect(html).not.toContain('<h1')
    expect(html).toContain('<code class="my-code">code</code>')
  })
})

describe('テーブルのセル', () => {
  it('セルの中のリンクは索引で解決し、グラフのリンクにも入る', async () => {
    const index = createIndex([{ id: 'b.csn', title: 'B', slug: 'b' }])
    const source = 'タイトル\ntable:表\n [B]\t[* 太字]'
    const result = await compile(source, { index })
    expect(result.metadata.links).toEqual(['B'])
    expect(await renderPage(source, { index })).toContain(
      '<td><a class="link" href="/b">B</a></td><td>[* 太字]</td>',
    )
  })

  it('parseOptions の tableCellNotation と renderOptions の tableCellLineBreaks を渡せる', async () => {
    const html = await renderPage('タイトル\ntable:表\n [* 太字]\\n2 行目', {
      parseOptions: { extensions: [tableCellNotation()] },
      renderOptions: { extensions: [tableCellLineBreaks('\\n')] },
    })
    expect(html).toContain(
      '<td><span class="decoration deco-*"><strong>太字</strong></span><br/>2 行目</td>',
    )
  })
})
