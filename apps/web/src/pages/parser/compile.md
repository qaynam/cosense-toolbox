---
layout: ../../layouts/Doc.astro
title: 独自の形式に変換する
description: toPlainText と createCompiler
---

# 独自の形式に変換する

前のページの `toHtml` は、これから説明する `createCompiler` の上に作られています。
同じ仕組みで、HTML 以外の形式も出せます。

いずれも `@cosense-toolbox/parser/compile` から import します。
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
コードブロックとテーブルは中身がそのまま出ます。

全文検索のインデックス作成や、抜粋の生成に使えます。

## createCompiler

```ts
createCompiler<Out>(options: { handlers; fallback }): (node) => Out
```

HTML とテキスト以外を出すときに使います。
`toHtml` も `toPlainText` もこれで書かれています。

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

`handlers` の書きかたは [`toHtml` の handlers](/parser/html/#handlers) と同じです。
違いは、既定のハンドラに重ねるのではなく、一式を自分で用意する点です。
ハンドラの無いノード型には `fallback` が使われます。

`handlers` の型はノード型のマップから導出されるので、ノード型が増えても型が追随します。

出力は文字列でなくてもかまいません。
React の要素を組み立てるなら `createCompiler<ReactNode>` にします。

ここまでで、既存の記法を読んで別の形にする方法は一通りです。
最後に、記法そのものを増やす方法を扱います。
