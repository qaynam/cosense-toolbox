---
layout: ../../layouts/Doc.astro
title: 記法の拡張
description: Extension で記法を足し、declaration merging で独自のノード型を足す
---

# 記法の拡張

ここまでは Cosense に元からある記法を扱ってきました。
このページでは、パーサーが解釈する記法そのものを増やします。

必要なものは `@cosense-toolbox/parser/extensions` から import します。
拡張を使わない場合はこのサブパスに触れないので、バンドルにも入りません。

| export              | 役割                                     |
| :------------------ | :--------------------------------------- |
| `InlineConstruct`   | 行の任意の位置から始まる記法を足します   |
| `BracketRule`       | `[...]` の中身の解釈を足します           |
| `Extension`         | 上の 2 つをまとめて `parse` に渡す形です |
| `customDecorations` | 装飾として読む記号を増やす既製の拡張です |

## 記法を足す

`Extension` を作って `parse` に渡します。
既定のルールより先に試されるので、既存の記法を上書きすることもできます。

```ts
import { parse } from "@cosense-toolbox/parser";
import type {
  Extension,
  InlineConstruct,
} from "@cosense-toolbox/parser/extensions";

const mention: InlineConstruct = (source, index) => {
  if (source[index] !== "@") return null;
  const match = source.slice(index + 1).match(/^[A-Za-z0-9_-]+/);
  if (!match) return null;
  return {
    node: { type: "internalLink", label: `@${match[0]}`, target: match[0] },
    length: match[0].length + 1,
  };
};

const mentions: Extension = { constructs: [mention] };

parse("メモ\n@qaynam に確認する", { extensions: [mentions] });
```

`null` を返すと、その位置では成立しなかったことになり、次のルールが試されます。
拡張は普通の関数で書けるので、`effect` を入れる必要はありません。
`position` は走査ループが付けるので、返す必要はありません。

`[...]` の中身の解釈を足す場合は `bracketRules` を使います。
同じ拡張で何度もパースするなら、[`createParser`](/parser/parse/#createparser) でパーサーを固定できます。

上の例は既存の `internalLink` に寄せているので、描画側は何も変えずに済みます。
新しい種類のノードにしたい場合は、次の手順が必要です。

## 文字装飾記法の記号を増やす

`[* x]` のように装飾として読む記号は、既定では `*` `/` `-` `_` の 4 つだけです。
それ以外の記号を使いたい場合は `customDecorations` を渡します。

```ts
import { parse } from "@cosense-toolbox/parser";
import { customDecorations } from "@cosense-toolbox/parser/extensions";

const page = parse(source, {
  extensions: [customDecorations(["=", "~", "|", "%", "&", "'"])],
});
```

渡した記号は既定の記号と混ぜられます。
`[*' x]` は太字になり、`markers` は `['*', "'"]` になります。

[`toHtml`](/parser/html/) はこれを `class="decoration deco-* deco-'"` として書き出すので、記号ごとに CSS を当てられます。

## テーブルのセルの中で記法を読む

テーブルのセルの中は、Cosense Web と同じくリンクの記法 (`[title]` / `[https://…]` / `[/project/page]` / 裸の URL / `#tag`) だけを読み、ほかの記法は書いたままの文字になります。
行と同じく記法を読みたい場合は `tableCellNotation` を渡します。Cosense Web には無い振る舞いです。

```ts
import { customDecorations, tableCellNotation } from "@cosense-toolbox/parser/extensions";

// すべての記法 (一緒に渡した拡張の記法も含む)
parse(source, { extensions: [customDecorations(["!"]), tableCellNotation()] });

// リンクに加えて、装飾だけ
parse(source, { extensions: [tableCellNotation(["decoration"])] });
```

自分で書く拡張でも、`keepInTableCell` でセルの中に残すノードを決められます。
true を返したノードは記法として残り、どの拡張も残さないノードは書いたままの文字に戻ります。

```ts
const keepCode: Extension = {
  keepInTableCell: (node) => node.type === "inlineCode",
};
```

セルの中の改行は記法ではなく見た目の約束なので、描画の拡張 [`tableCellLineBreaks`](/parser/html/#tablecelllinebreaks) で扱います。

## 独自のノード型を足す

既存のノード型に寄せず新しい `type` を作る場合は、`InlineNodeMap` を declaration merging で拡張します。
mdast と同じ手法で、`NodeHandlers` のキーにも `visit` の型引数にも自動で現れるので、描画まで型が通ります。

```ts
declare module "@cosense-toolbox/parser" {
  interface InlineNodeMap {
    mention: { type: "mention"; user: string; position: Position };
  }
}
```

あとは、記法を足したパーサーでパースして、その `type` に対するハンドラを書けば描画まで通ります。

```ts
import { parse } from "@cosense-toolbox/parser";
import { toHtml } from "@cosense-toolbox/parser/compile";

// mention が { type: 'mention', user } を返すようにしておく
const page = parse("メモ\n@qaynam に確認する", {
  extensions: [{ constructs: [mention] }],
});

toHtml(page, {
  handlers: {
    mention: (node) => ({
      type: "element",
      tagName: "a",
      properties: { href: `/u/${encodeURIComponent(node.user)}` },
      children: [{ type: "text", value: `@${node.user}` }],
    }),
  },
});
```

ハンドラを書かなかった独自ノードは、子があればその中身が出力されます。

## スキーマで検証する

最後に、AST を別のところから受け取る場合の話です。

`@cosense-toolbox/parser/schema` は、worklet や postMessage を跨いで受け取った、本当に `Page` か分からない値を検証します。

```ts
import { decodePage } from "@cosense-toolbox/parser/schema";
import { Either } from "effect";

const decoded = decodePage(JSON.parse(input));
if (Either.isRight(decoded)) {
  // decoded.right は Page
}
```

パース自体は失敗しないので、このサブパスが必要になるのは外から来た値を扱うときだけです。

## ここまでのまとめ

`parse` で AST を作り、`utils` で調べ、`compile` で別の形式に変え、`plugin` で記法を足す、という 4 つが揃いました。
それぞれの API の一覧は[概要](/parser/)の表に戻ると見渡せます。

不具合や記法の取りこぼしを見つけた場合は、[GitHub の issue](https://github.com/qaynam/cosense-toolbox/issues) でお知らせください。
