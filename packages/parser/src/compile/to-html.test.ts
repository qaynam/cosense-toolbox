import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import type { InlineConstruct } from '../inline/types'
import { parse, parseLine } from '../parse'
import type { InlineNodeInit } from '../types'
import type { NodeHandlers } from './create-compiler'
import { defaultPageUrl, escapeHtml, safeHref, safeSrc, toHtml } from './to-html'

/** 1 行を描画して、行を包む div を外した中身だけを見る。 */
const line = (source: string, options?: Parameters<typeof toHtml>[1]): string =>
  toHtml(parseLine(source), options).replace(/^<div class="line">|<\/div>$/g, '')

describe('インライン記法', () => {
  it('内部リンクは a になる', () => {
    expect(line('[リンク]')).toBe('<a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a>')
  })

  it('ハッシュタグは # 付きで表示される', () => {
    expect(line('#tag')).toBe('<a class="hashtag" href="/tag">#tag</a>')
  })

  it('装飾はフラグのぶんだけ要素が入れ子になる', () => {
    expect(line('[*-/_ text]')).toBe(
      '<span class="decoration"><strong><em><u><s>text</s></u></em></strong></span>',
    )
  })

  it('見出しの段階は data 属性で出す', () => {
    expect(line('[*** 見出し]')).toContain('data-size-level="2"')
  })

  it('装飾の中のリンクも描画される', () => {
    expect(line('[* [リンク]]')).toContain('<a class="link"')
  })

  it('インラインコードは code になる', () => {
    expect(line('`x`')).toBe('<code class="code">x</code>')
  })

  it('アイコンはそのユーザーのページへのリンクになる', () => {
    expect(line('[user.icon]')).toBe('<a class="link icon" href="/user">user</a>')
  })

  it('別プロジェクトのアイコンは区切りを保ったリンクになる', () => {
    expect(line('[/icons/炎上.icon]')).toContain('href="/icons/%E7%82%8E%E4%B8%8A"')
  })

  it('iconImageUrl を渡すと画像になる', () => {
    const html = line('[user.icon]', {
      iconImageUrl: (node) => `/api/pages/help-jp/${node.user}/icon`,
    })
    expect(html).toBe(
      '<a class="link icon" href="/user">' +
        '<img class="icon" src="/api/pages/help-jp/user/icon" alt="user" title="user"></a>',
    )
  })

  it('連打の数だけ出る', () => {
    expect(line('[user.icon*3]').match(/<a class="link icon"/g)).toHaveLength(3)
  })
})

describe('ブロック', () => {
  it('1 行目は h1 になる', () => {
    expect(toHtml(parse('タイトル'))).toBe(
      '<div class="page"><h1 class="title">タイトル</h1></div>',
    )
  })

  it('空行は高さを保つために br を置く', () => {
    expect(toHtml(parse('t\n\n'))).toContain('<div class="line"><br></div>')
  })

  it('インデントは data 属性で出す', () => {
    expect(toHtml(parse('t\n  字下げ'))).toContain('<div class="line" data-indent="2">')
  })

  it('引用は blockquote になる', () => {
    expect(line('> 引用')).toBe('<blockquote class="quote">引用</blockquote>')
  })

  it('コードブロックは本家と同じく 1 行ずつの要素になる', () => {
    expect(toHtml(parse('t\ncode:a.ts\n <b>\n x'))).toContain(
      '<div class="line code-block">' +
        '<code class="code-start"><span class="code-block-start">a.ts</span></code></div>' +
        '<div class="line code-block" data-indent="1"><code class="code-body">&lt;b&gt;</code></div>' +
        '<div class="line code-block" data-indent="1"><code class="code-body">x</code></div>',
    )
  })

  it('本体行はヘッダより 1 段深く、それより深い字下げは中身に残る', () => {
    expect(toHtml(parse('t\n code:a.ts\n  foo\n    bar'))).toContain(
      '<div class="line code-block" data-indent="2"><code class="code-body">  bar</code></div>',
    )
  })

  it('highlight を渡すと本体がひと塊になり、言語名が拡張子から渡る', () => {
    const seen: string[] = []
    const html = toHtml(parse('t\ncode:a.ts\n const a = 1\n const b = 2'), {
      highlight: (code, language) => {
        seen.push(language)
        return `<i>${escapeHtml(code)}</i>`
      },
    })
    expect(seen).toEqual(['ts'])
    // 複数行にまたがるタグを壊さないよう、行では切らない。
    expect(html).toContain(
      '<code class="code-body highlight"><i>const a = 1\nconst b = 2</i></code>',
    )
  })

  it('拡張子が無いファイル名はそのまま言語名になる', () => {
    const seen: string[] = []
    toHtml(parse('t\ncode:Python\n pass'), {
      highlight: (_code, language) => {
        seen.push(language)
        return ''
      },
    })
    expect(seen).toEqual(['python'])
  })

  it('highlight が無ければ 1 行ずつのまま', () => {
    const html = toHtml(parse('t\ncode:a.ts\n const a = 1\n const b = 2'))
    expect(html.match(/<code class="code-body">/g)).toHaveLength(2)
  })

  it('テーブルは caption 付きの table になる', () => {
    expect(toHtml(parse('t\ntable:名前\n あ\tい'))).toContain(
      '<table class="table"><caption>名前</caption><tbody><tr><td>あ</td><td>い</td></tr></tbody></table>',
    )
  })
})

describe('画像', () => {
  it('Gyazo のページ URL は描画のときだけ表示用 URL に直す', () => {
    const hash = '503a911fea542532aa5aba0a88eb7b60'
    const source = `[https://gyazo.com/${hash}]`
    // AST 側は書かれたままで、変換されるのは HTML の src だけ。
    expect(parseLine(source).children[0]).toMatchObject({ src: `https://gyazo.com/${hash}` })
    expect(line(source)).toBe(`<img class="image" src="https://i.gyazo.com/${hash}.png" alt="">`)
  })

  it('リンク付き画像は a で包む', () => {
    expect(line('[https://example.test https://x.test/a.png]')).toBe(
      '<a href="https://example.test"><img class="image" src="https://x.test/a.png" alt=""></a>',
    )
  })
})

describe('エスケープと URL の安全性', () => {
  it('テキストの HTML はエスケープされる', () => {
    expect(line('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('リンクのラベルと href はエスケープされる', () => {
    expect(line('["><script>]')).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('href に script が動く URL が来たら属性ごと落とす', () => {
    // 既定の href は encodeURIComponent するので安全だが、差し替えられた場合も守る。
    expect(line('[リンク]', { pageUrl: () => 'javascript:alert(1)' })).toBe(
      '<a class="link">リンク</a>',
    )
  })

  it('スキームの途中に空白を挟んだ URL も落とす', () => {
    expect(line('[リンク]', { pageUrl: () => 'java\tscript:alert(1)' })).not.toContain('href')
  })

  it('画像の src が script になる場合も落とす', () => {
    expect(line('[javascript:alert(1).png]')).toBe('<img class="image" alt="">')
  })

  it('safeHref / safeSrc は独自ハンドラ用に公開されている', () => {
    expect(safeHref('https://a.test/x')).toBe('https://a.test/x')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    // data: は href では拒み、src では許す (data: 画像は正当なため)。
    expect(safeHref('data:text/html,<script>')).toBeNull()
    expect(safeSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeSrc('javascript:alert(1)')).toBeNull()
  })

  it('defaultPageUrl は区切りを残して各段を encode する', () => {
    expect(defaultPageUrl('リンク')).toBe('/%E3%83%AA%E3%83%B3%E3%82%AF')
    expect(defaultPageUrl('/icons/炎上')).toBe('/icons/%E7%82%8E%E4%B8%8A')
  })

  it('escapeHtml は独自ハンドラ用に公開されている', () => {
    expect(escapeHtml(`<a href="x">'&</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;',
    )
  })
})

describe('差し替え', () => {
  it('handlers に書いた型だけが上書きされ、残りは既定のまま', () => {
    const html = toHtml(parseLine('[リンク] と `code`'), {
      handlers: { internalLink: (node) => `<x-link>${node.target}</x-link>` },
    })
    expect(html).toContain('<x-link>リンク</x-link>')
    expect(html).toContain('<code class="code">code</code>')
  })

  it('classNames は指定したキーだけを差し替える', () => {
    const html = toHtml(parseLine('[リンク] `code`'), {
      classNames: { internalLink: 'text-blue-500 underline' },
    })
    expect(html).toContain('<a class="text-blue-500 underline"')
    expect(html).toContain('<code class="code">')
  })

  it('class 名を空にすると class 属性ごと消える', () => {
    expect(toHtml(parseLine('`code`'), { classNames: { inlineCode: '', line: '' } })).toBe(
      '<div><code>code</code></div>',
    )
  })

  it('pageUrl を差し替えるとページ参照の遷移先が変わる', () => {
    // タイトルは記法に書かれたまま渡るので、ノード型で分岐しなくてよい。
    const html = toHtml(parseLine('[リンク] [/help-jp/使い方] #tag'), {
      pageUrl: (title) => `https://scrapbox.io${title.startsWith('/') ? '' : '/help-jp/'}${title}`,
    })
    // 差し替えた側が返した文字列をそのまま使う (percent encoding は差し替えた側の責任)。
    expect(html).toContain('href="https://scrapbox.io/help-jp/リンク"')
    expect(html).toContain('href="https://scrapbox.io/help-jp/使い方"')
    expect(html).toContain('href="https://scrapbox.io/help-jp/tag"')
  })

  it('pageUrl は外部リンクには効かない', () => {
    // 外部リンクは記法そのものが URL なので、解決するものが無い。
    const html = toHtml(parseLine('[リンク] https://a.test/x'), { pageUrl: () => '/x' })
    expect(html).toContain('href="https://a.test/x"')
    expect(html).toContain('href="/x"')
  })
})

describe('独自記法', () => {
  /** `@user` を独自ノードにする拡張。実際のプラグインは InlineNodeMap を declaration merging で拡張する。 */
  const mentionConstruct: InlineConstruct = (source, index) => {
    if (source[index] !== '@') return Option.none()
    const name = source.slice(index + 1).match(/^[A-Za-z0-9_-]+/)?.[0]
    if (name === undefined) return Option.none()
    return Option.some({
      node: { type: 'mention', user: name } as unknown as InlineNodeInit,
      length: name.length + 1,
    })
  }
  const extensions = [{ constructs: [mentionConstruct] }]

  it('ハンドラを足せば独自ノードも描画できる', () => {
    const html = toHtml(parseLine('hi @qaynam', { extensions }), {
      // declaration merging をしていれば、このキャストは要らない。
      handlers: {
        mention: (node: { user: string }) => `<mention>${escapeHtml(node.user)}</mention>`,
      } as NodeHandlers<string>,
    })
    expect(html).toContain('<mention>qaynam</mention>')
  })

  it('ハンドラが無い独自ノードでも中身を落とさずに描画が続く', () => {
    const html = toHtml(parseLine('hi @qaynam です', { extensions }))
    expect(html).toBe('<div class="line">hi  です</div>')
  })
})

describe('スタイルの差し込み', () => {
  it('style に渡した CSS が先頭に付く', () => {
    const html = toHtml(parse('t'), { style: '.line { color: red }' })
    expect(html).toBe(
      '<style>.line { color: red }</style><div class="page"><h1 class="title">t</h1></div>',
    )
  })

  it('既定では付かない', () => {
    expect(toHtml(parse('t'))).not.toContain('<style>')
  })
})

describe('インデントの中点', () => {
  it('既定では深さを data 属性だけで表す', () => {
    expect(toHtml(parse('t\n  字下げ'))).toContain('<div class="line" data-indent="2">字下げ</div>')
  })

  it('showPads を渡すと深さのぶんだけ余白が並び、右端に中点が付く', () => {
    expect(toHtml(parse('t\n  字下げ'), { showPads: true })).toContain(
      '<div class="line" data-indent="2">' +
        '<span class="indent-mark"><span class="pad"> </span><span class="pad"> </span>' +
        '<span class="dot"></span></span>字下げ</div>',
    )
  })

  it('インデントが無い行には付かない', () => {
    expect(toHtml(parse('t\n字下げなし'), { showPads: true })).not.toContain('indent-mark')
  })
})
