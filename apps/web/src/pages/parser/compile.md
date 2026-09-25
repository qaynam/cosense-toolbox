---
layout: ../../layouts/Doc.astro
title: 独自形式への変換
description: toPlainText と createCompiler
---

# 独自形式への変換

前のページの `toHtml` は、hast を通して HTML を作ります。
HTML 以外の形式は、ノード型ごとのハンドラで出力を組み立てる `createCompiler` で出せます。

いずれも `@cosense-toolbox/parser/compile` から import します。
HTML 系の出力 (`toHast` / `toHtml`) は `@cosense-toolbox/parser/html` にあり、この入口からは読み込まれません。
この層はパーサー本体を import しないので、変換だけを使う側のバンドルにパーサーは入りません。

## toPlainText

```ts
toPlainText(node: AnyNode): string
```

記法を外したテキストを返します。
オプションはありません。

```ts
import { toPlainText } from '@cosense-toolbox/parser/compile'

toPlainText(parse('タイトル\n[* 太字] と [リンク]'))
// 'タイトル\n太字 と リンク'
```

インデントは半角 2 文字、引用は `> ` として残ります。
コードブロックは中身がそのまま、テーブルはタブ区切りで出ます。セルの中のリンクは、行と同じく表示の文字になります。

全文検索のインデックス作成や、抜粋の生成に使えます。

## createCompiler

```ts
createCompiler<Out>(options: { handlers; fallback }): (node) => Out
```

HTML 系 (hast / HTML の文字列) とテキスト以外を出すときに使います。
`toPlainText` はこれで書かれています。HTML 系は `toHast` を使ってください。

```ts
import { createCompiler } from '@cosense-toolbox/parser/compile'

const toMarkdown = createCompiler<string>({
  handlers: {
    internalLink: (node) => `[[${node.target}]]`,
    decoration: (node, ctx) => `**${ctx.children(node).join('')}**`,
    text: (node) => node.value,
  },
  fallback: (node, ctx) => ctx.children(node).join(''),
})
```

`handlers` の書きかたは [`toHtml` の handlers](/parser/html/#handlers) と同じ `(node, ctx)` です。
違いは、既定のハンドラに重ねるのではなく一式を自分で用意する点と、`ctx.children(node)` が子ごとの結果の配列を返す点です。
ハンドラの無いノード型には `fallback` が使われます。

`handlers` の型はノード型のマップから導出されるので、ノード型が増えても型が追随します。

出力は文字列でなくてもかまわないので、React の要素を組み立てるなら `createCompiler<ReactNode>` にします。

ここまでで、既存の記法を読んで別の形にする方法は一通りです。
最後に、記法そのものを増やす方法を扱います。
