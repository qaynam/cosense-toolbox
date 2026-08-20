# @cosense-toolbox/parser

Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換する。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/parser/>**

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

`import` 元がサブパスごとに分かれている。

| API | 何をするか | import 元 |
| :--- | :--- | :--- |
| `parse` | ページ全文を `Page` にする | `@cosense-toolbox/parser` |
| `parseLine` | 1 行だけをパースする | `@cosense-toolbox/parser` |
| `tokenizeInline` | 行の中の記法だけを取る | `@cosense-toolbox/parser` |
| `createParser` | 拡張を固定したパーサーを作る | `@cosense-toolbox/parser` |
| `asImageSrc` | 画像 URL を `<img src>` の形にする | `@cosense-toolbox/parser` |
| `visit` `find` `collect` | AST を辿る、探す、集める | `@cosense-toolbox/parser/utils` |
| `collectLinks` `firstImage` `rawTextOf` | リンク、サムネイル、生テキスト | `@cosense-toolbox/parser/utils` |
| `toHtml` | HTML にする | `@cosense-toolbox/parser/compile` |
| `toPlainText` | 記法を外したテキストにする | `@cosense-toolbox/parser/compile` |
| `createCompiler` | 独自の形式にする | `@cosense-toolbox/parser/compile` |
| `Extension` `InlineConstruct` | 記法を足す (型のみ) | `@cosense-toolbox/parser/plugin` |
| `decodePage` | 外から来た値が `Page` か検証する | `@cosense-toolbox/parser/schema` |

各 API の詳細はドキュメントにある。

| ページ | 内容 |
| :--- | :--- |
| [概要](https://cosense-toolbox.qaynam.dev/parser/) | インストールと、どの API を使うかの早見表 |
| [記法ギャラリー](https://cosense-toolbox.qaynam.dev/parser/demo/) | 記法をひととおり変換した結果 |
| [パースする](https://cosense-toolbox.qaynam.dev/parser/parse/) | `parse` / `parseLine` / `tokenizeInline` / `createParser` |
| [AST と位置情報](https://cosense-toolbox.qaynam.dev/parser/ast/) | ノードの構造と `position` の意味 |
| [AST を調べる](https://cosense-toolbox.qaynam.dev/parser/utils/) | `visit` / `find` / `collect` など |
| [HTML に変換する](https://cosense-toolbox.qaynam.dev/parser/html/) | `toHtml` と 7 つのオプション |
| [独自の形式に変換する](https://cosense-toolbox.qaynam.dev/parser/compile/) | `toPlainText` / `createCompiler` |
| [記法を拡張する](https://cosense-toolbox.qaynam.dev/parser/extend/) | `Extension` と独自のノード型 |

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
