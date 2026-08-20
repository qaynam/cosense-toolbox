---
layout: ../../layouts/Doc.astro
title: '@cosense-toolbox/parser'
description: Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換するパーサー
---

# @cosense-toolbox/parser

`@cosense-toolbox/parser` は Cosense (旧 Scrapbox) の記法を AST に変換するパーサーです。
依存は `effect` だけで、ブラウザでも Node でも Cloudflare Workers でも動作します。

記法を読み取るだけでなく、それが元のテキストのどこに書かれていたかまで返します。

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

正規表現で切り出す場合と違って記法の種類を判別したうえで取り出すので、`[* 太字]` や `` `[code]` `` はリンクとして数えません。

> **beta**：公開 API はまだ変わる可能性があります。

> **注意**
>
> このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装です。
> 開発元である Helpfeel 社とは関係がなく、公認も受けていません。

## クイックスタート

これを実行するだけです。

```sh
npm i @cosense-toolbox/parser@beta
```

```sh
bun add @cosense-toolbox/parser@beta
```

既定の見た目が必要であれば、[`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) を別途入れてください。

## 特徴

- **位置がわかる** - どのノードも元のテキストの何行目の何文字目から始まるかを持っています。エディタでの色付けや、カーソルの下にある記法の判定に使えます。詳しくは [AST と位置情報](/parser/ast/)をご覧ください。
- **軽い** - パースだけなら gzip 約 8 KB です。HTML への変換もヘルパーも別の import 元にしてあるので、使わなければバンドルに入りません。
- **持ち運べる** - AST はメソッドを持たないただのオブジェクトです。`JSON.stringify` した結果を保存して後から読み直したり、Web Worker のような別スレッドへ送ったりできます。
- **ヘルパーがある** - リンクを集める、ある型のノードを数える、生テキストを切り出す、といった処理は書かずに済みます。詳しくは[ヘルパー](/parser/utils/)をご覧ください。
- **拡張できる** - 記法も出力も足せます。プロジェクト固有の書きかたを足しても、元からある記法と同じように扱えます。詳しくは[記法の拡張](/parser/extend/)をご覧ください。
- **型が効く** - ノードは `type` で判別できる union です。記法を足せば、走査にも描画にも型が付いてきます。

## 使用例

- Cosense のページを自分のサイトやアプリで表示する
- リンクを辿ってサイトマップや関連ページの一覧を作る
- 記法を外したテキストから全文検索のインデックスを作る
- エディタで記法をハイライトしたり、カーソルの下のリンクを判定したりする
- ページを Markdown や独自の形式へ書き出す
- ページ内の画像を集めてサムネイルを選ぶ

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
どの記法がどう変換されるかを先に見たい場合は、[例](/parser/demo/)にすべて並べてあります。

## ライセンス

MIT
