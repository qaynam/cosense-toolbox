---
layout: ../../layouts/Doc.astro
title: 記法を拡張する
description: Extension で記法を足し、declaration merging で独自のノード型を足す
---

# 記法を拡張する

型は `@cosense-toolbox/parser/plugin` から import する。
このサブパスは型だけを持ち、実行時のコードを含まない。

| 型 | 役割 |
| :--- | :--- |
| `InlineConstruct` | 行の任意の位置から始まる記法を足す |
| `BracketRule` | `[...]` の中身の解釈を足す |
| `Extension` | 上の 2 つをまとめて `parse` に渡す形 |
| `NodeHandlers` | 出力側のハンドラの型 |

## 記法を足す

`Extension` を作って `parse` に渡す。
既定のルールより先に試されるので、既存の記法を上書きすることもできる。

```ts
import { Option } from 'effect'
import { parse } from '@cosense-toolbox/parser'
import type { Extension, InlineConstruct } from '@cosense-toolbox/parser/plugin'

const mention: InlineConstruct = (source, index) => {
  if (source[index] !== '@') return Option.none()
  const match = source.slice(index + 1).match(/^[A-Za-z0-9_-]+/)
  if (!match) return Option.none()
  return Option.some({
    node: { type: 'internalLink', label: `@${match[0]}`, target: match[0] },
    length: match[0].length + 1,
  })
}

const mentions: Extension = { constructs: [mention] }

parse(source, { extensions: [mentions] })
```

`Option.none()` を返すとその位置では成立しなかったことになり、次のルールが試される。
`position` は返さない。走査ループが付ける。

`[...]` の中身の解釈を足すなら `bracketRules` を使う。
同じ拡張で何度もパースするなら [`createParser`](/parser/parse/#createparser) でパーサーを固定できる。

## 独自のノード型を足す

既存のノード型に寄せず新しい `type` を作る場合は、`InlineNodeMap` を declaration merging で拡張する。
mdast と同じ手法で、`NodeHandlers` のキーにも `visit` の型引数にも自動で現れるので、描画まで型が通る。

```ts
declare module '@cosense-toolbox/parser' {
  interface InlineNodeMap {
    mention: { type: 'mention'; user: string; position: Position }
  }
}
```

```ts
// 記法を足す
const mention: InlineConstruct = (source, index) => { /* → { type: 'mention', user } */ }

// 描画を足す
toHtml(page, {
  handlers: { mention: (node) => `<a href="/u/${node.user}">@${escapeHtml(node.user)}</a>` },
})
```

ハンドラを書かなかった独自ノードは、子があればその中身が出力される。

## スキーマで検証する

`@cosense-toolbox/parser/schema` は、worklet や postMessage を跨いで受け取った、本当に `Page` か分からない値を検証する。

```ts
import { decodePage } from '@cosense-toolbox/parser/schema'
import { Either } from 'effect'

const decoded = decodePage(JSON.parse(input))
if (Either.isRight(decoded)) {
  // decoded.right は Page
}
```

パース自体は失敗しないので、このサブパスが要るのは外から来た値を扱うときだけになる。

## 設計

パースは総関数で、どんな入力でも例外を投げず必ず `Page` を返す。
記法として成立しない部分は素のテキストになるだけで、エラーにはならない。

I/O をしない。
oEmbed の取得や動画判定のような URL の意味解決は、このパッケージの外の仕事になる。
画像かどうかの判定だけは、記法の構造そのものを決めるので含んでいる。

構造は micromark の「位置つきノードと記法ハンドラの登録制」と、markdown-it の「優先順位付きルールを先頭から試す」形を参考にしている。

開発時の規約は [CLAUDE.md](https://github.com/qaynam/cosense-toolbox/blob/main/packages/parser/CLAUDE.md) にある。
