/**
 * インライン記法の仕様。旧実装の行パーサーのテストを、新しい AST に合わせて書き直したもの。
 * 構造の比較は position を落として行う。位置情報の検証は別ファイルに分けてある。
 */
import { describe, expect, it } from 'vitest'
import { stripPositions } from '../test-helpers'
import type { Decoration, InlineNode } from '../types'
import { tokenizeInline } from './tokenize'

const nodes = (source: string, options?: { allowDecoration?: boolean }) =>
  stripPositions(tokenizeInline(source, options))

const types = (source: string) => tokenizeInline(source).map((n) => n.type)

const first = (source: string) => stripPositions(tokenizeInline(source)[0] as InlineNode)

const decorationAt = (source: string, index = 0): Decoration => {
  const node = tokenizeInline(source)[index]
  if (node?.type !== 'decoration') throw new Error(`not a decoration: ${node?.type}`)
  return node
}

describe('リンク', () => {
  it('[title] は内部リンクになる', () => {
    expect(nodes('see [React Native] here')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'internalLink', label: 'React Native', target: 'React Native' },
      { type: 'text', value: ' here' },
    ])
  })

  it('裸の URL は外部リンクになる', () => {
    expect(nodes('go https://a.test/x now')).toEqual([
      { type: 'text', value: 'go ' },
      { type: 'externalLink', label: 'https://a.test/x', target: 'https://a.test/x' },
      { type: 'text', value: ' now' },
    ])
  })

  it('[url label] と [label url] はどちらもラベル付き外部リンクになる', () => {
    expect(first('[https://example.com Example]')).toEqual({
      type: 'externalLink',
      label: 'Example',
      target: 'https://example.com',
    })
    expect(first('[Example https://example.com]')).toEqual({
      type: 'externalLink',
      label: 'Example',
      target: 'https://example.com',
    })
  })

  it('画像でない URL が 2 つ並ぶと 先頭がリンク先・2 番目が表示テキストになる', () => {
    expect(first('[https://a.com https://b.com]')).toEqual({
      type: 'externalLink',
      label: 'https://b.com',
      target: 'https://a.com',
    })
  })

  it('ラベルがあれば URL が画像でも文字リンクのままになる', () => {
    expect(first('[googlecom https://x.com/a.png]')).toEqual({
      type: 'externalLink',
      label: 'googlecom',
      target: 'https://x.com/a.png',
    })
    expect(first('[googlecom test hello https://x.com/a.png]')).toEqual({
      type: 'externalLink',
      label: 'googlecom test hello',
      target: 'https://x.com/a.png',
    })
  })

  it('[/project/title] はプロジェクトリンクになり project と title に分解される', () => {
    expect(first('[/help-jp/Cosense]')).toEqual({
      type: 'projectLink',
      label: '/help-jp/Cosense',
      target: '/help-jp/Cosense',
      project: 'help-jp',
      title: 'Cosense',
    })
  })

  it('[/project] はタイトルが空のプロジェクトリンクになる', () => {
    expect(first('[/help-jp]')).toEqual({
      type: 'projectLink',
      label: '/help-jp',
      target: '/help-jp',
      project: 'help-jp',
      title: '',
    })
  })
})

describe('ハッシュタグ', () => {
  it('#tag はハッシュタグになる', () => {
    expect(nodes('foo #tag bar')).toEqual([
      { type: 'text', value: 'foo ' },
      { type: 'hashtag', value: 'tag' },
      { type: 'text', value: ' bar' },
    ])
  })

  it('単語の途中の # はハッシュタグにならない', () => {
    expect(nodes('a#b')).toEqual([{ type: 'text', value: 'a#b' }])
  })
})

describe('装飾', () => {
  it('[* text] は太字になる', () => {
    expect(decorationAt('[* ただの強調]')).toMatchObject({
      type: 'decoration',
      value: 'ただの強調',
      bold: true,
      italic: false,
      strike: false,
      underline: false,
      sizeLevel: 0,
    })
  })

  it('アスタリスクの数が見出しサイズになる', () => {
    expect(decorationAt('[*** 見出し]')).toMatchObject({ bold: true, sizeLevel: 2 })
    expect(decorationAt('[**** [リンク] そう]')).toMatchObject({ sizeLevel: 3 })
  })

  it('[_ text] は下線になる', () => {
    expect(decorationAt('[_ 下線]')).toMatchObject({ underline: true, bold: false })
  })

  it('装飾記号は組み合わせられる', () => {
    expect(decorationAt('[-/ x]')).toMatchObject({ strike: true, italic: true, bold: false })
  })

  it('[[text]] は太字になる', () => {
    expect(decorationAt('[[太字]]')).toMatchObject({
      type: 'decoration',
      bold: true,
      value: '太字',
    })
  })

  it('[[...]] は深さを数えず最初の ]] で閉じる', () => {
    // 本家準拠。`[[強調 [リンク]]]` は `[[強調 [リンク` + `]]` と読まれ、末尾の `]` が余る。
    expect(nodes('[[強調 [リンク]]]')).toEqual([
      {
        type: 'decoration',
        value: '強調 [リンク',
        bold: true,
        italic: false,
        strike: false,
        underline: false,
        sizeLevel: 0,
        children: [{ type: 'text', value: '強調 [リンク' }],
      },
      { type: 'text', value: ']' },
    ])
  })

  it('ネストが無くても children にテキストノードを持つ', () => {
    expect(decorationAt('[* ただの強調]').children).toEqual([
      expect.objectContaining({ type: 'text', value: 'ただの強調' }),
    ])
  })

  it('装飾の中のリンクは子ノードとして解釈される', () => {
    expect(stripPositions(decorationAt('[* [ここはリンク]ですね]').children)).toEqual([
      { type: 'internalLink', label: 'ここはリンク', target: 'ここはリンク' },
      { type: 'text', value: 'ですね' },
    ])
  })

  it('装飾の中の装飾は装飾にならずリンクとして解釈される', () => {
    // 本家準拠: 装飾の入れ子は不可。[* 太字] の部分は内部リンクになる。
    expect(stripPositions(decorationAt('[* [* 太字]ですね]').children)).toEqual([
      { type: 'internalLink', label: '* 太字', target: '* 太字' },
      { type: 'text', value: 'ですね' },
    ])
  })

  it('装飾の中では拡張子だけの画像はリンクになる', () => {
    // 本家準拠: 装飾内の相対パス画像はインライン画像にせずリンク扱い。
    expect(stripPositions(decorationAt('[* [a.png]]').children)).toEqual([
      { type: 'internalLink', label: 'a.png', target: 'a.png' },
    ])
  })

  it('装飾の中でもフル URL の画像はリンクになる', () => {
    expect(stripPositions(decorationAt('[- https://gyazo.com/x.png]').children)).toEqual([
      {
        type: 'externalLink',
        label: 'https://gyazo.com/x.png',
        target: 'https://gyazo.com/x.png',
      },
    ])
  })

  it('allowDecoration: false では装飾記法を解釈しない', () => {
    expect(nodes('[* 太字]', { allowDecoration: false })).toEqual([
      { type: 'internalLink', label: '* 太字', target: '* 太字' },
    ])
  })
})

describe('角括弧の対応', () => {
  it('空の角括弧は素の文字列になる', () => {
    expect(nodes('[]')).toEqual([{ type: 'text', value: '[]' }])
    expect(nodes('a [] b')).toEqual([{ type: 'text', value: 'a [] b' }])
    expect(nodes('[ ]')).toEqual([{ type: 'text', value: '[ ]' }])
  })

  it('閉じない [ は素の文字列になる', () => {
    expect(nodes('foo [ bar')).toEqual([{ type: 'text', value: 'foo [ bar' }])
  })

  it('外側の [] が記法にならないときは先頭の [ だけが文字になり内側が記法になる', () => {
    expect(nodes('[[そうね] ですね]')).toEqual([
      { type: 'text', value: '[' },
      { type: 'internalLink', label: 'そうね', target: 'そうね' },
      { type: 'text', value: ' ですね]' },
    ])
  })

  it('外側が無効で内側が装飾のときも内側だけ記法になる', () => {
    expect(nodes('[[_ 下線]ですね]')).toEqual([
      { type: 'text', value: '[' },
      {
        type: 'decoration',
        value: '下線',
        bold: false,
        italic: false,
        strike: false,
        underline: true,
        sizeLevel: 0,
        children: [{ type: 'text', value: '下線' }],
      },
      { type: 'text', value: 'ですね]' },
    ])
  })
})

describe('インラインコード', () => {
  it('バッククォートで囲むとインラインコードになる', () => {
    expect(types('a `code` b')).toEqual(['text', 'inlineCode', 'text'])
    expect(nodes('a `code` b')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'inlineCode', value: 'code' },
      { type: 'text', value: ' b' },
    ])
  })
})

describe('画像', () => {
  it('角括弧つきの画像 URL は画像になる', () => {
    expect(first('[https://i.gyazo.com/x.png]')).toEqual({
      type: 'image',
      src: 'https://i.gyazo.com/x.png',
    })
  })

  it('裸の画像 URL は画像にならず外部リンクのままになる', () => {
    // 本家準拠: 画像になるのは角括弧で囲んだときだけ。
    expect(first('https://gyazo.com/x.png')).toMatchObject({ type: 'externalLink' })
  })

  it('[[画像 URL]] は large 付きの画像になる', () => {
    expect(first('[[https://i.gyazo.com/x.png]]')).toEqual({
      type: 'image',
      src: 'https://i.gyazo.com/x.png',
      large: true,
    })
  })

  it('Gyazo のページ URL は画像になるが src は書かれたまま', () => {
    // 表示用 URL への変換 (i.gyazo.com/....png) はパーサーの仕事ではない。
    // AST はソースに書かれた文字列を保ち、変換は asImageSrc / レンダラー側で行う。
    const hash = '503a911fea542532aa5aba0a88eb7b60'
    expect(first(`[https://gyazo.com/${hash}]`)).toEqual({
      type: 'image',
      src: `https://gyazo.com/${hash}`,
    })
    expect(first(`https://gyazo.com/${hash}`)).toMatchObject({ type: 'externalLink' })
  })

  it('画像 URL とリンク URL が並ぶとリンク付き画像になる', () => {
    expect(first('[https://google.com https://x.com/a.png]')).toEqual({
      type: 'image',
      src: 'https://x.com/a.png',
      link: 'https://google.com',
    })
    expect(first('[https://x.com/a.png https://google.com]')).toEqual({
      type: 'image',
      src: 'https://x.com/a.png',
      link: 'https://google.com',
    })
  })

  it('画像 URL が 2 つ並ぶと最後が表示され先頭がリンク先になる', () => {
    expect(first('[https://x.com/a.png https://y.com/b.png]')).toEqual({
      type: 'image',
      src: 'https://y.com/b.png',
      link: 'https://x.com/a.png',
    })
  })

  it('クエリつきの画像 URL も角括弧つきなら画像になる', () => {
    const page = 'https://example.com/articles/n227e1d0f1486'
    const img =
      'https://cdn.example.com/uploads/images/300017800/rectangle.jpeg?fit=bounds&quality=85&width=1280'
    expect(first(`[${img}]`)).toEqual({ type: 'image', src: img })
    expect(first(`[${page} ${img}]`)).toEqual({ type: 'image', src: img, link: page })
    expect(nodes(`${page} ${img}`)).toEqual([
      { type: 'externalLink', label: page, target: page },
      { type: 'text', value: ' ' },
      { type: 'externalLink', label: img, target: img },
    ])
  })

  it('svg も画像として扱われる', () => {
    expect(first('[https://example.com/logo.svg]')).toEqual({
      type: 'image',
      src: 'https://example.com/logo.svg',
    })
    expect(first('[https://example.com/logo.svg?v=2]')).toEqual({
      type: 'image',
      src: 'https://example.com/logo.svg?v=2',
    })
  })

  it('#.svg を付けた拡張子なし URL は画像になる', () => {
    const badge = 'https://kanban.example.dev/api/status/abc?userId=xyz#.svg'
    expect(first(`[${badge}]`)).toEqual({ type: 'image', src: badge })
  })
})

describe('アイコン', () => {
  it('[user.icon] はアイコンになる', () => {
    expect(first('[takker.icon]')).toEqual({ type: 'icon', user: 'takker', count: 1 })
  })

  it('[user.icon*N] は連打数を持つ', () => {
    expect(first('[alice.icon*5]')).toEqual({ type: 'icon', user: 'alice', count: 5 })
  })

  it('連打数は 1..20 に収まる', () => {
    expect(first('[a.icon*0]')).toEqual({ type: 'icon', user: 'a', count: 1 })
    expect(first('[a.icon*999]')).toEqual({ type: 'icon', user: 'a', count: 20 })
  })
})

describe('数式', () => {
  it('[$ ...] は数式になる', () => {
    expect(first('[$ x^2]')).toEqual({ type: 'formula', value: 'x^2' })
  })
})

describe('空文字列', () => {
  it('空文字列はノードを 1 つも生まない', () => {
    expect(tokenizeInline('')).toEqual([])
  })
})
