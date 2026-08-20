---
layout: ../../layouts/Doc.astro
title: パースする
description: parse / parseLine / tokenizeInline / createParser の使い分け
---

# パースする

すべて `@cosense-toolbox/parser` から import する。
どれも例外を投げず、どんな入力でも必ず値を返す。
記法として成立しない部分は素のテキストになるだけで、エラーにはならない。

## parse

```ts
parse(source: string, options?: ParseOptions): Page
```

ページ全文を受け取り、ブロックの並びを返す。

```ts
import { parse } from '@cosense-toolbox/parser'

const page = parse('タイトル\nこれは [リンク] です')

for (const block of page.children) {
  switch (block.type) {
    case 'title':
      console.log('title:', block.value)
      break
    case 'line':
      console.log('line:', block.children.map((node) => node.type))
      break
    case 'codeBlock':
      console.log(block.filename, block.lines.map((line) => line.value))
      break
    case 'table':
      console.log(block.name, block.rows.length)
      break
    default:
      break
  }
}
```

1 行目は無条件でタイトルとして扱う。
`code:` と `table:` は複数行にまたがるので、ページの文脈があって初めてブロックにまとまる。

## parseLine

```ts
parseLine(raw: string, origin?: { line?: number; offset?: number }): LineBlock
```

1 行だけを通常行としてパースする。
エディタのように行単位で扱うときに使う。

```ts
import { parseLine } from '@cosense-toolbox/parser'

parseLine('  > [リンク]')
// LineBlock { indent: 2, quote: true, monospace: false, children: [...] }
```

ページの文脈がないので、`code:` と `table:` は**ブロックにならない**。

```ts
parseLine('code:foo.js')
// LineBlock { children: [{ type: 'text', value: 'code:foo.js' }] }
```

コードブロックやテーブルが要る処理には `parse` を使う。

`origin` にその行がページの何行目かを渡すと、位置情報がページ全体と揃う。

## tokenizeInline

```ts
tokenizeInline(source: string, options?: TokenizeOptions): readonly InlineNode[]
```

行の中だけを解析して、インラインノードの並びを返す。
インデントや引用の判定はしない。

```ts
import { tokenizeInline } from '@cosense-toolbox/parser'

tokenizeInline('[* 太字] と [リンク]')
// [ Decoration, TextNode, InternalLink ]
```

改行を含まない 1 行分の文字列を渡す。

## createParser

```ts
createParser(options?: ParserOptions): { parse; parseLine; tokenizeInline }
```

拡張を固定したパーサーを作る。
同じ拡張で何度もパースするときに、毎回 `extensions` を渡さずに済む。

```ts
import { createParser } from '@cosense-toolbox/parser'

const parser = createParser({ extensions: [mentions] })
parser.parse(source)
parser.parseLine(line)
```

拡張の書きかたは[記法を拡張する](/parser/extend/)にある。

## asImageSrc

```ts
asImageSrc(url: string): string | null
```

画像 URL を `<img src>` に入れられる形にする。
画像でなければ `null` を返す。

```ts
import { asImageSrc } from '@cosense-toolbox/parser'

asImageSrc('https://gyazo.com/503a911fea542532aa5aba0a88eb7b60')
// → 'https://i.gyazo.com/503a911fea542532aa5aba0a88eb7b60.png'

asImageSrc('https://example.test/page')
// → null
```

Gyazo のページ URL は画像そのものではないので、ここでだけ画像 URL に差し替わる。
`parse` はこの変換をしない。AST はソースに書かれた文字列を保つ。

## normalizeLineEndings

```ts
normalizeLineEndings(source: string): string
```

CRLF と CR を LF に揃える。
`parse` は必ずこれを通してから解析するので、位置情報を自分で計算するときに使う。
