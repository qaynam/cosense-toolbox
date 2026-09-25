---
layout: ../../layouts/Doc.astro
title: AST と位置情報
description: ブロックとインラインノードの構造、position の意味
---

# AST と位置情報

前のページの `parse` が返した `Page` の中身を見ていきます。
ここで出てくるノードの名前は、このあとの走査でも変換でもそのまま使います。

## ブロックの構造

```text
Page
├─ TitleBlock   1 行目。value に生テキスト、children にインラインノード
├─ CodeBlock    code:filename とその配下 (CodeLine[])
├─ TableBlock   table:name とその配下 (TableRow[] → TableCell[]。セルは value と children)
└─ LineBlock    通常の行 (indent / quote / monospace + InlineNode[])
```

`Page` の直下に来るのはこの 4 種類だけで、入れ子にはなりません。
インデントによる親子関係は `LineBlock.indent` に数値として残ります。

## インラインノード

`TitleBlock` と `LineBlock` の `children` に入るのが、インラインノードです。
テーブルのセル (`TableCell`) の `children` にも入ります。
ただしセルの中では Cosense Web と同じく、既定ではリンクの記法 (`internalLink` / `externalLink` / `projectLink` / `hashtag`) だけを読み、ほかの記法は書いたままの `text` になります。
行と同じく記法を読みたいときは、`parse` の `extensions` に [`tableCellNotation()`](/parser/extend/#テーブルのセルの中で記法を読む) を渡してください。
10 種類あり、すべて `type` で判別できます。

| type           | 記法                                                                 |
| :------------- | :------------------------------------------------------------------- |
| `text`         | 記法にならなかった素のテキスト                                       |
| `internalLink` | `[title]`                                                            |
| `externalLink` | 裸の URL、`[url]`、`[url label]`、`[label url]`                      |
| `projectLink`  | `[/project/title]` (`project` と `title` に分解済み)                 |
| `hashtag`      | `#tag`                                                               |
| `inlineCode`   | `` `code` ``                                                         |
| `image`        | `[url.png]`、`[[url.png]]` (large)、`[linkUrl imageUrl]` (link つき) |
| `icon`         | `[user.icon]`、`[user.icon*5]`                                       |
| `formula`      | `[$ x^2]`                                                            |
| `decoration`   | `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合、`[[太字]]` |

リンクを `internalLink` と `externalLink` と `projectLink` の 3 つに分けてあるので、`switch` の網羅性が効きます。

### 装飾は入れ子になりません

Cosense では 1 つの記法が複数の装飾を同時に持ち、`[-/ x]` は打消しかつ斜体になります。
そのため Markdown のように要素を入れ子にせず、1 ノードが複数のフラグを持つ形にしています。

書かれた記号そのものは `markers` に出現順、重複なしで残ります。
`[*** x]` なら `['*']`、`[-/ x]` なら `['-', '/']` です。
`[[x]]` は記号を書きませんが、太字なので `['*']` として扱います。

意味を持つのは `*` と `/` と `-` と `_` の 4 つだけです。
読む記号を増やす方法は[記法の拡張](/parser/extend/#文字装飾記法の記号を増やす)にあります。

### 画像の src は書き換えない

`image` の `src` はソースに書かれた URL のままで、パーサーは書き換えません。

Gyazo のページ URL (`https://gyazo.com/{hash}`) のように、そのままでは `<img>` に入れられない URL があり、これを表示用に直すのは描画側の仕事になります。
どのノード型になるかは記法の構造で決まるのでパーサーが判定し、値の書き換えは描画のときに行う、という切り分けです。

その変換は前のページの [`asImageSrc`](/parser/parse/#asimagesrc) が担当します。

## position

すべてのノードが `position` を持ちます。

```ts
interface Point {
  line: number
  column: number
  offset: number
} // すべて 0-based
interface Position {
  start: Point
  end: Point
} // end は exclusive
```

```ts
parse("タイトル\nサンプル").children[1].children[0]
// {
//   type: 'text',
//   value: 'サンプル',
//   position: {
//     start: { line: 1, column: 0, offset: 5 },
//     end:   { line: 1, column: 4, offset: 9 },
//   },
// }
```

`line` はページ内の行番号で、0 がタイトル行になります。
`column` は行内の文字オフセット、`offset` はページ全文の中の文字オフセットを指します。

`source.slice(start.offset, end.offset)` は、`[` や `#` などのマーカーも含めて、その記法の生テキスト全体と一致します。

0-based にしてあるのは、JS の `slice` にそのまま渡せるようにするためです。
行番号を画面に出すときは 1 を足してください。

`offset` は文字オフセットであってバイト位置ではありません。
CRLF と CR は LF に正規化されてから解析されるので、位置は正規化後の文字列が基準になります。

## 位置情報で何ができるか

- 記法のシンタックスハイライト
- カーソルの下にある記法の判定
- クリックした要素と元テキストの対応づけ
- 記法の一部だけを置換する編集操作

いずれも AST の中から目的のノードを探す作業が前提になるので、その探しかたを次のページで扱います。
