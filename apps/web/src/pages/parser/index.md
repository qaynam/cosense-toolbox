---
layout: ../../layouts/Doc.astro
title: '@cosense-toolbox/parser'
description: Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換するパーサー
---

# @cosense-toolbox/parser

Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換するライブラリです。

- 依存は `effect` だけです。DOM も Node の API も使わないので、ブラウザでも Node でも Cloudflare Workers でも同じように動きます。
- どのノードも、元のテキストの何行目の何文字目から始まるかを持っています。エディタで記法に色を付けたり、カーソルの下にあるリンクを判定したりできます。
- AST はメソッドを持たない、ただのオブジェクトです。`JSON.stringify` した結果をそのまま保存しておいて、あとで読み直せます。Web Worker のような別スレッドへ送ることもできます。
- 記法そのものを増やせます。プロジェクト固有の書きかたを足しても、元からある記法と同じように扱えます。
- パースだけなら gzip 約 8 KB です。HTML への変換や AST の走査は別の import 元にしてあるので、使わなければバンドルに入りません。

> **beta**：公開 API はまだ変わる可能性があります。

> **注意**
>
> このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装です。
> 開発元である Helpfeel 社とは関係がなく、公認も受けていません。

## インストールの仕方

```sh
npm i @cosense-toolbox/parser@beta
```

```sh
bun add @cosense-toolbox/parser@beta
```

既定の見た目が必要であれば、[`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) を別途入れてください。

## 使い方

ページに書かれたリンクを集めてみます。

```ts
import { parse } from '@cosense-toolbox/parser'
import { collectLinks } from '@cosense-toolbox/parser/utils'

const page = parse(`今日のメモ
[プロジェクトA] の進捗を確認する
#あとで読む`)

collectLinks(page) // → ['プロジェクトA', 'あとで読む']
```

正規表現で切り出す場合と違い、`[* 太字]` や `` `[code]` `` はリンクとして数えません。
記法の種類を判別したうえで取り出せます。

同じ `page` から HTML を作ることもできます。

```ts
import { toHtml } from '@cosense-toolbox/parser/compile'

toHtml(page)
// <div class="page"><h1 class="title">今日のメモ</h1>…
```

このように、まず `parse` で AST を作り、その AST を目的に応じて処理する、という二段構えになっています。

## 全体の流れ

```text
Cosense のテキスト
        │
        │  parse()
        ▼
位置情報つきの AST ───┬─ collectLinks()  リンクを集める
                     ├─ visit()         木を辿る
                     ├─ toHtml()        HTML にする
                     ├─ toPlainText()   記法を外す
                     └─ createCompiler() 独自の形式にする
```

パーサーは AST を作るところまでを担当します。
AST から先をどうするかは、用途ごとに別のサブパスへ分かれています。

## API の選び方

`import` 元がサブパスごとに分かれている点にご注意ください。

| やりたいこと | API | import 元 |
| :--- | :--- | :--- |
| ページ全体をパースする | [`parse`](/parser/parse/#parse) | `@cosense-toolbox/parser` |
| エディタで 1 行だけパースする | [`parseLine`](/parser/parse/#parseline) | `@cosense-toolbox/parser` |
| 行の中の記法だけを取る | [`tokenizeInline`](/parser/parse/#tokenizeinline) | `@cosense-toolbox/parser` |
| 拡張を固定したパーサーを作る | [`createParser`](/parser/parse/#createparser) | `@cosense-toolbox/parser` |
| リンクを集める | [`collectLinks`](/parser/utils/#collectlinks) | `@cosense-toolbox/parser/utils` |
| ある型のノードを集める | [`collect`](/parser/utils/#collect) | `@cosense-toolbox/parser/utils` |
| 木を辿る | [`visit`](/parser/utils/#visit) | `@cosense-toolbox/parser/utils` |
| HTML にする | [`toHtml`](/parser/html/) | `@cosense-toolbox/parser/compile` |
| 記法を外したテキストにする | [`toPlainText`](/parser/compile/#toplaintext) | `@cosense-toolbox/parser/compile` |
| 独自の形式にする | [`createCompiler`](/parser/compile/#createcompiler) | `@cosense-toolbox/parser/compile` |
| 記法を追加する | [`Extension`](/parser/extend/) | `@cosense-toolbox/parser/plugin` |
| 外から来た値が `Page` か検証する | [`decodePage`](/parser/extend/#スキーマで検証する) | `@cosense-toolbox/parser/schema` |

この表の順番で、次のページから順に説明していきます。
どの記法がどう変換されるかを先に見たい場合は、[対応記法](/parser/demo/)にすべて並べてあります。

## 互換性について

| 変更 | バージョン |
| :--- | :--- |
| 新しいノード `type` の追加 | minor |
| 既存ノードへの optional フィールド追加 | minor |
| オプションへの optional フィールド追加 | minor |
| 既存ノードのフィールドの削除、型変更、必須化 | major |
| `position` の意味論の変更 | major |
| ノード `type` 文字列のリネーム | major |

ノード型は minor で増える可能性があるので、`switch (node.type)` には `default` を置いてください。

```ts
switch (node.type) {
  case 'text':
    return node.value
  case 'internalLink':
    return node.label
  default:
    // 知らないノード型はここに来る
    return ''
}
```

## ライセンス

MIT です。
