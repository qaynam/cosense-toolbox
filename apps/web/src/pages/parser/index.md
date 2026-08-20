---
layout: ../../layouts/Doc.astro
title: '@cosense-toolbox/parser'
description: Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換するパーサー
---

# @cosense-toolbox/parser

Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換するライブラリです。

- 依存は `effect` だけで、DOM も Node の API も使わないので、ブラウザでも Node でも Cloudflare Workers でも同じように動きます。
- どのノードも元のテキストの何行目の何文字目から始まるかを持っているので、エディタで記法に色を付けたり、カーソルの下にあるリンクを判定したりできます。
- AST はメソッドを持たないただのオブジェクトなので、`JSON.stringify` した結果をそのまま保存して後から読み直したり、Web Worker のような別スレッドへ送ったりできます。
- 記法そのものを増やせるので、プロジェクト固有の書きかたを足しても元からある記法と同じように扱えます。
- HTML への変換や AST の走査は別の import 元にしてあるので、使わなければバンドルに入らず、パースだけなら gzip 約 8 KB に収まります。

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

ページをパースして、リンクを集めたり HTML にしたりしてみます。

```ts
import { parse } from '@cosense-toolbox/parser'
import { collectLinks } from '@cosense-toolbox/parser/utils'
import { toHtml } from '@cosense-toolbox/parser/compile'

const page = parse(`今日のメモ
[プロジェクトA] の進捗を確認する
#あとで読む`)

collectLinks(page)
// → ['プロジェクトA', 'あとで読む']

toHtml(page)
// → '<div class="page"><h1 class="title">今日のメモ</h1>…'
```

まず `parse` で AST を作り、その AST を目的に応じて処理する、という二段構えになっています。

正規表現で切り出す場合と違って記法の種類を判別したうえで取り出すので、`[* 太字]` や `` `[code]` `` はリンクとして数えません。

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

パーサーは AST を作るところまでを担当していて、AST から先をどうするかは用途ごとに別のサブパスへ分かれています。

## API

サブパスごとに分かれています。
使うものだけ import すれば、残りはバンドルに入りません。

### @cosense-toolbox/parser

テキストを AST にします。

| API | 何をするか |
| :--- | :--- |
| [`parse`](/parser/parse/#parse) | ページ全体をパースする |
| [`parseLine`](/parser/parse/#parseline) | 1 行だけをパースする |
| [`tokenizeInline`](/parser/parse/#tokenizeinline) | 行の中の記法だけを取る |
| [`createParser`](/parser/parse/#createparser) | 拡張を固定したパーサーを作る |
| [`asImageSrc`](/parser/parse/#asimagesrc) | 画像 URL を `<img src>` に入る形にする |
| [`normalizeLineEndings`](/parser/parse/#normalizelineendings) | 改行コードを LF に揃える |

### @cosense-toolbox/parser/utils

AST から欲しいものを取り出します。

| API | 何をするか |
| :--- | :--- |
| [`visit`](/parser/utils/#visit) | 木を深さ優先で辿る |
| [`find`](/parser/utils/#find) | ある型の最初のノードを返す |
| [`collect`](/parser/utils/#collect) | ある型のノードをすべて集める |
| [`collectLinks`](/parser/utils/#collectlinks) | リンクの指す先を集める |
| [`firstImage`](/parser/utils/#firstimage) | 最初の画像ノードを返す |
| [`rawTextOf`](/parser/utils/#rawtextof) | ノードの生テキストを切り出す |

### @cosense-toolbox/parser/compile

AST を別の形式に変換します。

| API | 何をするか |
| :--- | :--- |
| [`toHtml`](/parser/html/) | HTML にする |
| [`toPlainText`](/parser/compile/#toplaintext) | 記法を外したテキストにする |
| [`createCompiler`](/parser/compile/#createcompiler) | 独自の形式にする |

### @cosense-toolbox/parser/plugin

記法を足すための型だけを持ち、実行時のコードは含みません。

| 型 | 何をするか |
| :--- | :--- |
| [`InlineConstruct`](/parser/extend/#記法を足す) | 行のどこからでも始まる記法を足す |
| [`BracketRule`](/parser/extend/#記法を足す) | `[...]` の中身の解釈を足す |
| [`Extension`](/parser/extend/#記法を足す) | 上の 2 つをまとめて `parse` に渡す |
| [`NodeHandlers`](/parser/html/#handlers) | 出力側のハンドラの型 |

### @cosense-toolbox/parser/schema

外から来た値を検証します。

| API | 何をするか |
| :--- | :--- |
| [`decodePage`](/parser/extend/#スキーマで検証する) | 値が `Page` かどうか確かめる |

上から順に、次のページから説明していきます。
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
