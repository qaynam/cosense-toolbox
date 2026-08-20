---
layout: ../../layouts/Doc.astro
title: 独自の形式に変換する
description: toPlainText と createCompiler
---

# 独自の形式に変換する

`@cosense-toolbox/parser/compile` から import する。
この層はパーサー本体を import しないので、変換だけを使う側のバンドルにパーサーは入らない。

## toPlainText

```ts
toPlainText(node: AnyNode): string
```

記法を外したテキストを返す。オプションは無い。

```ts
import { toPlainText } from '@cosense-toolbox/parser/compile'

toPlainText(parse('タイトル\n[* 太字] と [リンク]'))
// 'タイトル\n太字 と リンク'
```

インデントは半角 2 文字、引用は `> ` として残る。
コードブロックとテーブルは中身がそのまま出る。

全文検索のインデックス作成や、抜粋の生成に使える。

## createCompiler

```ts
createCompiler<Out>(options: { handlers; fallback }): (node) => Out
```

HTML とテキスト以外を出すときに使う。
`toHtml` も `toPlainText` もこれで書かれている。

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

`handlers` の型はノード型のマップから導出されるので、ノード型が増えても型が追随する。
`fallback` はハンドラの無いノード型に使われる。

出力は文字列でなくてもよい。React の要素を組み立てるなら `createCompiler<ReactNode>` にする。
