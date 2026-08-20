# @cosense-toolbox/parser

Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換する。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/parser/>**

- 依存は `effect` だけ。DOM も Node の API も使わないので、ブラウザでも Node でも Workers でも動く
- どのノードも元のテキストの何行目の何文字目から始まるかを持つので、エディタの色付けやカーソル位置の判定に使える
- AST はメソッドを持たないただのオブジェクト。`JSON.stringify` して保存しておき、あとで読み直せる
- 記法そのものを増やせる。プロジェクト固有の書きかたも元からある記法と同じように扱える
- パースだけなら gzip 約 8 KB。HTML 変換や走査は別の import 元なので、使わなければバンドルに入らない

> **beta**：公開 API はまだ変わりうる。安定するまではバージョンを固定して使うほうが安全。

## インストール

```sh
npm i @cosense-toolbox/parser@beta
```

既定の見た目が要るなら [`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) を別途入れる。

## 使ってみる

```ts
import { parse } from '@cosense-toolbox/parser'
import { collectLinks } from '@cosense-toolbox/parser/utils'
import { toHtml } from '@cosense-toolbox/parser/compile'

const page = parse(`今日のメモ
[プロジェクトA] の進捗を確認する
#あとで読む`)

collectLinks(page) // → ['プロジェクトA', 'あとで読む']
toHtml(page)       // → '<div class="page"><h1 class="title">今日のメモ</h1>…'
```

## API

モジュールごとに export が分かれている。使うものだけ import すればよい。

| モジュール | 役割 | API |
| :--- | :--- | :--- |
| `@cosense-toolbox/parser` | テキストを AST にする | `parse` `parseLine` `tokenizeInline` `createParser` `asImageSrc` `normalizeLineEndings` |
| `@cosense-toolbox/parser/utils` | ヘルパー。AST から取り出す | `visit` `find` `collect` `collectLinks` `firstImage` `rawTextOf` |
| `@cosense-toolbox/parser/compile` | AST を別の形式にする | `toHtml` `toPlainText` `createCompiler` |
| `@cosense-toolbox/parser/plugin` | 記法を足す (型のみ) | `Extension` `InlineConstruct` `BracketRule` `NodeHandlers` |
| `@cosense-toolbox/parser/schema` | 外から来た値を検証する | `decodePage` |

各 API の詳細はドキュメントにある。

| ページ | 内容 |
| :--- | :--- |
| [概要](https://cosense-toolbox.qaynam.dev/parser/) | インストールと、どの API を使うかの早見表 |
| [例](https://cosense-toolbox.qaynam.dev/parser/demo/) | 記法をひととおり変換した結果とコード |
| [パース](https://cosense-toolbox.qaynam.dev/parser/parse/) | `parse` / `parseLine` / `tokenizeInline` / `createParser` |
| [AST と位置情報](https://cosense-toolbox.qaynam.dev/parser/ast/) | ノードの構造と `position` の意味 |
| [ヘルパー](https://cosense-toolbox.qaynam.dev/parser/utils/) | `visit` / `find` / `collect` など |
| [HTML への変換](https://cosense-toolbox.qaynam.dev/parser/html/) | `toHtml` と 7 つのオプション |
| [独自形式への変換](https://cosense-toolbox.qaynam.dev/parser/compile/) | `toPlainText` / `createCompiler` |
| [記法の拡張](https://cosense-toolbox.qaynam.dev/parser/extend/) | `Extension` と独自のノード型 |

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

## 開発

規約は [CLAUDE.md](./CLAUDE.md) にある。

```sh
bun install
bun run test
bun run build
```

## ライセンス

MIT。

このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装である。
開発元である Helpfeel 社とは関係がなく、公認も受けていない。
