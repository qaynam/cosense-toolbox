import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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

  it('コンポーネントに属性と、インデントした後続行を children として渡す', async () => {
    const source = 'タイトル\n<Callout type="warn" count={2}>\n 注意\n後ろ'
    const html = await renderPage(source, { format: 'csnx' }, { components: { Callout } })
    expect(html).toContain(
      '<aside data-type="warn" data-count="2"><div class="line">注意</div></aside><div class="line">後ろ</div>',
    )
  })

  it('コンポーネントが渡されなければ、元の行をテキストとして出す', async () => {
    const html = await renderPage('タイトル\n<Missing a="1" />', { format: 'csnx' })
    expect(html).toContain('<div class="line">&lt;Missing a=&quot;1&quot; /&gt;</div>')
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

  it('コンポーネントの行は説明文に入れない', async () => {
    const { metadata } = await compile('タイトル\n<Counter />\n本文', { format: 'csnx' })
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
