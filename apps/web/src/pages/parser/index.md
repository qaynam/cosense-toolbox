---
layout: ../../layouts/Doc.astro
title: '@cosense-toolbox/parser'
description: Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換するパーサー
---

# @cosense-toolbox/parser

Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換する。

- 依存は `effect` だけ。DOM も Node の API も使わない
- すべてのノードがソース上の位置を持つので、エディタのハイライトやキャレット連携に使える
- AST は plain object。`JSON.stringify` で往復でき、worklet や postMessage を跨げる
- 記法と出力の両方をプラグインで拡張できる
- サブパスごとに export が分かれていて tree-shaking が効く (`parse` だけなら gzip 約 8 KB)

> **beta**：公開 API はまだ変わりうる。安定するまではバージョンを固定して使うほうが安全。

## インストール

```sh
npm i @cosense-toolbox/parser@beta
```

```sh
bun add @cosense-toolbox/parser@beta
```

既定の見た目が要るなら [`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) を別途入れる。

## 使ってみる

ページに書かれたリンクを集める。

```ts
import { parse } from '@cosense-toolbox/parser'
import { collectLinks } from '@cosense-toolbox/parser/utils'

const page = parse(`今日のメモ
[プロジェクトA] の進捗を確認する
#あとで読む`)

collectLinks(page) // → ['プロジェクトA', 'あとで読む']
```

正規表現で切り出すのと違い、`[* 太字]` や `` `[code]` `` はリンクとして数えない。
記法の種類を判別したうえで取り出せる。

HTML にするならこう書く。

```ts
import { toHtml } from '@cosense-toolbox/parser/compile'

toHtml(page)
// <div class="page"><h1 class="title">今日のメモ</h1>…
```

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

## どの API を使う？

`import` 元がサブパスごとに分かれている点に注意する。

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

## 互換性の方針

| 変更 | バージョン |
| :--- | :--- |
| 新しいノード `type` の追加 | minor |
| 既存ノードへの optional フィールド追加 | minor |
| オプションへの optional フィールド追加 | minor |
| 既存ノードのフィールドの削除、型変更、必須化 | major |
| `position` の意味論の変更 | major |
| ノード `type` 文字列のリネーム | major |

ノード型は minor で増えうるので、`switch (node.type)` には `default` を置いておく。

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

MIT。

このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装である。
開発元である Helpfeel 社とは関係がなく、公認も受けていない。
