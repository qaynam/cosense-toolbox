---
layout: ../../layouts/Doc.astro
title: 記法の拡張
description: Extension で記法を足し、declaration merging で独自のノード型を足す
---

# 記法の拡張

ここまでは Cosense に元からある記法を扱ってきました。
このページでは、パーサーが解釈する記法そのものを増やします。

型は `@cosense-toolbox/parser/plugin` から import します。
このサブパスは型だけを持ち、実行時のコードを含みません。

| 型 | 役割 |
| :--- | :--- |
| `InlineConstruct` | 行の任意の位置から始まる記法を足します |
| `BracketRule` | `[...]` の中身の解釈を足します |
| `Extension` | 上の 2 つをまとめて `parse` に渡す形です |
| `NodeHandlers` | 出力側のハンドラの型です |

## 記法を足す

`Extension` を作って `parse` に渡します。
既定のルールより先に試されるので、既存の記法を上書きすることもできます。

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

`Option.none()` を返すと、その位置では成立しなかったことになり、次のルールが試されます。
`position` は返しません。
走査ループが付けます。

`[...]` の中身の解釈を足す場合は `bracketRules` を使います。
同じ拡張で何度もパースするなら、[`createParser`](/parser/parse/#createparser) でパーサーを固定できます。

上の例は既存の `internalLink` に寄せているので、描画側は何も変えずに済みます。
新しい種類のノードにしたい場合は、次の手順が必要です。

## 独自のノード型を足す

既存のノード型に寄せず新しい `type` を作る場合は、`InlineNodeMap` を declaration merging で拡張します。
mdast と同じ手法で、`NodeHandlers` のキーにも `visit` の型引数にも自動で現れるので、描画まで型が通ります。

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

ハンドラを書かなかった独自ノードは、子があればその中身が出力されます。

## スキーマで検証する

最後に、AST を別のところから受け取る場合の話です。

`@cosense-toolbox/parser/schema` は、worklet や postMessage を跨いで受け取った、本当に `Page` か分からない値を検証します。

```ts
import { decodePage } from '@cosense-toolbox/parser/schema'
import { Either } from 'effect'

const decoded = decodePage(JSON.parse(input))
if (Either.isRight(decoded)) {
  // decoded.right は Page
}
```

パース自体は失敗しないので、このサブパスが必要になるのは外から来た値を扱うときだけです。

## ここまでのまとめ

`parse` で AST を作り、`utils` で調べ、`compile` で別の形式に変え、`plugin` で記法を足す、という 4 つが揃いました。
それぞれの API の一覧は[概要](/parser/)の表に戻ると見渡せます。

不具合や記法の取りこぼしを見つけた場合は、[GitHub の issue](https://github.com/qaynam/cosense-toolbox/issues) でお知らせください。
