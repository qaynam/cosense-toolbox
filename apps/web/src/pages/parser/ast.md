---
layout: ../../layouts/Doc.astro
title: AST と位置情報
description: ブロックとインラインノードの構造、position の意味
---

# AST と位置情報

## ブロックの構造

```text
Page
├─ TitleBlock   1 行目。value に生テキスト、children にインラインノード
├─ CodeBlock    code:filename とその配下 (CodeLine[])
├─ TableBlock   table:name とその配下 (TableRow[] → TableCell[])
└─ LineBlock    通常の行 (indent / quote / monospace + InlineNode[])
```

`Page` の直下に来るのはこの 4 種類だけで、入れ子にはならない。
インデントによる親子関係は `LineBlock.indent` に数値として残る。

## インラインノード

10 種類あり、すべて `type` で判別できる。

| type | 記法 |
| :--- | :--- |
| `text` | 記法にならなかった素のテキスト |
| `internalLink` | `[title]` |
| `externalLink` | 裸の URL、`[url]`、`[url label]`、`[label url]` |
| `projectLink` | `[/project/title]` (`project` と `title` に分解済み) |
| `hashtag` | `#tag` |
| `inlineCode` | `` `code` `` |
| `image` | `[url.png]`、`[[url.png]]` (large)、`[linkUrl imageUrl]` (link つき) |
| `icon` | `[user.icon]`、`[user.icon*5]` |
| `formula` | `[$ x^2]` |
| `decoration` | `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合、`[[太字]]` |

リンクを `internalLink` / `externalLink` / `projectLink` の 3 つに分けてあるので、`switch` の網羅性が効く。

### 装飾は入れ子にならない

Cosense では 1 つの記法が複数の装飾を同時に持つ。
`[-/ x]` は打消しかつ斜体である。
Markdown のように要素を入れ子にせず、1 ノードが複数のフラグを持つ形にしている。

### 画像の src は書き換えない

`image` の `src` はソースに書かれた URL のままで、パーサーは書き換えない。
Gyazo のページ URL (`https://gyazo.com/{hash}`) のように、そのままでは `<img>` に入れられない URL を表示用に直すのは描画側の仕事になる。
その変換は [`asImageSrc`](/parser/parse/#asimagesrc) が担当する。

## position

すべてのノードが `position` を持つ。

```ts
interface Point { line: number; column: number; offset: number }  // すべて 0-based
interface Position { start: Point; end: Point }                   // end は exclusive
```

```ts
parse('タイトル\nサンプル').children[1].children[0]
// {
//   type: 'text',
//   value: 'サンプル',
//   position: {
//     start: { line: 1, column: 0, offset: 5 },
//     end:   { line: 1, column: 4, offset: 9 },
//   },
// }
```

`line` はページ内の行番号で、0 がタイトル行になる。
`column` は行内の文字オフセット、`offset` はページ全文の中の文字オフセットを指す。

`source.slice(start.offset, end.offset)` は、その記法の生テキスト全体と一致する。
`[` や `#` などのマーカーも含む。

0-based にしてあるのは、JS の `slice` にそのまま渡せるようにするため。
行番号を画面に出すときは 1 を足す。

`offset` は文字オフセットであってバイト位置ではない。
CRLF と CR は LF に正規化されてから解析されるので、位置は正規化後の文字列が基準になる。

## 位置情報で何ができるか

- 記法のシンタックスハイライト
- キャレット位置にある記法の判定
- クリックした要素と元テキストの対応づけ
- 記法の一部だけを置換する編集操作

ノードの生テキストを切り出すには [`rawTextOf`](/parser/utils/#rawtextof) を使う。
