# @cosense-toolbox/parser

Cosense (旧 Scrapbox) の記法を、位置情報つきの AST に変換する。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/parser/>**

- 依存は `effect` だけ。DOM も Node の API も使わないので、ブラウザでも Node でも Workers でも動く
- どのノードも元のテキストの何行目の何文字目から始まるかを持つので、エディタの色付けやカーソル位置の判定に使える
- AST はメソッドを持たないただのオブジェクト。`JSON.stringify` して保存しておき、あとで読み直せる
- 記法そのものを増やせる。プロジェクト固有の書きかたも元からある記法と同じように扱える
- パースだけなら gzip 約 10 KB。HTML 変換や Markdown の読み込み、走査は別の import 元なので、使わなければバンドルに入らない

> **beta**：公開 API はまだ変わりうる。安定するまではバージョンを固定して使うほうが安全。

### 0.1.0-beta.9 の変更

- `isPage` を足した (`@cosense-toolbox/parser/schema`)。外から来た値が `Page` の形かを `true` / `false` で返すので、
  effect を使わずに検証できる。どこが違うかを知りたいときは、今までどおり `decodePage` (effect の `Either` を返す) を使う。
- `@cosense-toolbox/parser/from-markdown` を足した。`parseFromMarkdown` は Markdown (ChatGPT の回答や README など) を読んで、
  Cosense のページの AST にする。箇条書きは字下げに、見出しは大きい文字の装飾に、フェンスは `code:` に、表は `table:` になる。
  先頭が `#` の見出しならタイトルになる。`$...$` は pandoc と同じ決まりで数式にし (`$5と$10` のような値段は数式にしない)、
  `math: false` を渡すと数式として読まない。

### 0.1.0-beta.8 の変更

- **不具合の修正:** URL でない画像の名前 (`[a.png]`) を画像として、`[[a.png]]` を大きい画像として読んでいたのをやめた。
  Cosense Web と同じく、`[a.png]` は `a.png` というページへのリンク、`[[a.png]]` は太字の文字になる。
  画像になるのは、今までどおり `[https://…/a.png]` のような URL だけ。
- **不具合の修正:** `[[...]]` の閉じ方を Cosense Web と同じにした。最初の `]]` から続く `]` の並びの、
  最後の 2 つで閉じる。`[[[リンク]]]` は太字のリンクに、`[[a]]]` は `a]` の太字になる (今までは最初の `]]` で閉じ、`]` が余っていた)。
  中身が空の `[[]]` と、`[[` で始まる中身は太字にならない。`[[画像 URL]]]` は今までどおり大きい画像と `]` になる。
- 拡張 `publicMedia` を足した (`@cosense-toolbox/parser/extensions`)。サイトに置いたファイルを、
  `[:/images/a.png]` のようにサイトの根元からのパスで画像・動画・音声として読む。`[[:/…]]` で大きい画像・動画になる。
  種類は拡張子で決め、`src` は `base` オプションを付けたパス (`/docs/images/a.png`) になる。
  メディアでないファイル (`[:/files/a.pdf]`) は、そのファイルへの外部リンクになる。拡張を渡したときは、`[:/…]` がページへのリンクになることは無い。
- **移行:** `[a.png]` で手元の画像を出していたページは、画像を `public/` などサイトの根元から配る場所に置き、
  `[:/a.png]` に書き換えて `publicMedia()` を渡す。`@cosense-toolbox/astro` はこの拡張を既定で有効にしている。

### 0.1.0-beta.7 の変更

- 動画・音声・埋め込みのノードを足した。どれも Cosense Web がパースの段階で読み分けているもので、今までは外部リンクになっていた。
  - `video`: `[https://…/a.mp4]` (拡張子は mp4 / webm / mov)。`[[…]]` で大きい動画 (`large`)、
    URL を 2 つ並べるとリンク付き動画 (`link`) になる。単独の動画 URL にはクエリを付けられない。
  - `audio`: `[https://…/a.mp3]` (拡張子は wav / mp3 / weba / ogg / aac)。前後に文字を書くと、その文字が `label` になる。
  - `embed`: YouTube / Vimeo / Spotify / anchor.fm の URL。`provider` と、サービスの中での `id` (と `kind`) を持つ。
    `<iframe>` に入れる URL は `asEmbedSrc` で作る。
- `toHtml` / `toHast` は、動画を `<video>`、音声を `<audio>`、埋め込みを `<iframe>` にする。
  class 名は `classNames` の `video` / `audio` / `embed` で変えられる。
- 地図のノード `location` を足した。`[N35.68,E139.76]` (ズームは `,Z14`) で、座標の前後に書いた文字が `label` になる。
  緯度と経度は数値で、南緯と西経は負の数になる。Google マップの URL は `asMapUrl` で作り、`toHtml` はそこへのリンクを出す
  (class 名は `classNames` の `location`)。
- Cosense Web が埋め込まないサービスは、拡張の `bracketRules` から独自の `provider` の `embed` を返せば足せる。
  既定の `toHtml` はプレーヤーの URL を知らない埋め込みを外部リンクとして出すので、見た目は `handlers` か `extensions` で決める。

### 0.1.0-beta.6 の変更

- インラインコードが始まる括弧を、記法として読まないようにした。Cosense Web はコードを括弧より先に読むので、
  ``[* 太字の `code` です]`` は装飾にならず、括弧はそのままの文字、`` `code` `` はインラインコードになる。
  数式 (`[$ …]`) も同じで、` [$ a`] `` は数式にならない。閉じないバッククォートは括弧を妨げない。
- コマンドの行を Cosense Web に合わせた。字下げの後が `$` か `%` と空白で、その後に何かある行だけがコマンドになる
  (`monospace: true`)。コマンドの行は記法を読まず、`children` は書いたままの文字の `text` 1 つになる。
  `$aa` のように空白が無い行と、引用の行 (`> $ x`) はコマンドにならない。
  `toHtml` / `toHast` は、Cosense Web と同じくコマンドの行を記号・空白・コマンドの要素に分けて出す
  (`<span class="prefix">$</span><span class="space"> </span><span class="command">ls</span>`)。
  class 名は `classNames` の `commandPrefix` / `commandSpace` / `command` で変えられる。

### 0.1.0-beta.5 の変更

- タイトル行の記法を読まないようにした。Cosense Web と同じく、`[x]` も `#tag` も書いたままの文字になる。
  `TitleBlock` の形は変わらず、`children` が書いたままの文字の `text` 1 つになる。

### 0.1.0-beta.3 の変更

- Cosense の文字装飾の記号 `!"#%&'()*+,-./{|}<>_~=` からなる並びを、**拡張なしで**すべて装飾として読むようにした。
  Cosense Web と同じ読み方で、`[! 注意]` は内部リンクではなく `markers: ['!']` の装飾になる。
  見た目 (bold などのフラグ) が付くのは今までどおり `* / - _` だけ。ほかの記号の見た目は CSS で付ける。
- **`customDecorations` を削除した**。集合の中の記号は既定で読むので、この拡張で足せるのは
  Cosense Web が装飾にしない記号だけになり、Web 版と違う AST を作るため。渡していた箇所は消すだけでよい。

### 0.1.0-beta.2 の変更

- 記法の拡張 (`InlineConstruct` / `BracketRule`) は、成立しなければ **`null` を返す**普通の関数になった。
  これまでは effect の `Option` を返す必要があり、拡張を書くのに effect が要った。
  `Option.none()` は `null` に、`Option.some(x)` は `x` に書き換える。
- 拡張のルールに渡る文脈から `bracketRules` を外した。拡張から使う場面が無く、中の型が漏れていたため。

### 0.1.0-beta.1 の変更

beta.0 から上げるときは次の 2 点に注意。

- サブパス `./plugin` を **`./extensions`** に改名した。渡すものが `Extension` で
  オプション名も `extensions` なのに、置き場所だけ別の語彙だったため。
  コンパイラを書くための型 (`NodeHandlers` 等) は `./compile` にある。
- `decoration` ノードに **`markers`** を足した (必須)。書かれた装飾記号が
  出現順・重複なしで入る。`toHtml` はこれを `deco-*` のような class として出す。
  装飾ノードを自分で組み立てている拡張は追随が要る。

## インストール

```sh
npm i @cosense-toolbox/parser
```

既定の見た目が要るなら [`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) を別途入れる。

## 使ってみる

```ts
import { parse } from "@cosense-toolbox/parser"
import { collectLinks } from "@cosense-toolbox/parser/utils"
import { toHtml } from "@cosense-toolbox/parser/html"

const page = parse(`今日のメモ
[プロジェクトA] の進捗を確認する
#あとで読む`)

collectLinks(page) // → ['プロジェクトA', 'あとで読む']
toHtml(page) // → '<div class="page"><h1 class="title">今日のメモ</h1>…'
```

## API

モジュールごとに export が分かれている。使うものだけ import すればよい。

| モジュール                              | 役割                                                | API                                                                                                             |
| :-------------------------------------- | :-------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| `@cosense-toolbox/parser`               | テキストを AST にする                               | `parse` `parseLine` `tokenizeInline` `createParser` `asImageSrc` `asEmbedSrc` `asMapUrl` `normalizeLineEndings` |
| `@cosense-toolbox/parser/utils`         | ヘルパー。AST から取り出す                          | `visit` `find` `collect` `collectLinks` `firstImage` `rawTextOf`                                                |
| `@cosense-toolbox/parser/html`          | AST を HTML 系の出力 (hast と HTML の文字列) にする | `toHast` `toHtml` `codeLineNumbers` `tableCellLineBreaks`                                                       |
| `@cosense-toolbox/parser/from-markdown` | Markdown を読んで AST にする                        | `parseFromMarkdown`                                                                                             |
| `@cosense-toolbox/parser/compile`       | AST を HTML 以外の形式にする                        | `toPlainText` `createCompiler`                                                                                  |
| `@cosense-toolbox/parser/extensions`    | 記法を足す                                          | `Extension` `InlineConstruct` `BracketRule` `tableCellNotation`                                                 |
| `@cosense-toolbox/parser/schema`        | 外から来た値を検証する                              | `isPage` `decodePage`                                                                                           |

`parse` はページ全体を読む。1 行目はタイトルで、Cosense Web と同じく記法を読まない。
記法を読みたい文字列がページでないなら、本文の 1 行は `parseLine`、文章の断片は `tokenizeInline` で読む。

各 API の詳細はドキュメントにある。

| ページ                                                                        | 内容                                                      |
| :---------------------------------------------------------------------------- | :-------------------------------------------------------- |
| [概要](https://cosense-toolbox.qaynam.dev/parser/)                            | インストールと、どの API を使うかの早見表                 |
| [例](https://cosense-toolbox.qaynam.dev/parser/demo/)                         | 記法をひととおり変換した結果とコード                      |
| [パース](https://cosense-toolbox.qaynam.dev/parser/parse/)                    | `parse` / `parseLine` / `tokenizeInline` / `createParser` |
| [AST と位置情報](https://cosense-toolbox.qaynam.dev/parser/ast/)              | ノードの構造と `position` の意味                          |
| [ヘルパー](https://cosense-toolbox.qaynam.dev/parser/utils/)                  | `visit` / `find` / `collect` など                         |
| [HTML への変換](https://cosense-toolbox.qaynam.dev/parser/html/)              | `toHast` / `toHtml` と 8 つのオプション                   |
| [Markdown から読む](https://cosense-toolbox.qaynam.dev/parser/from-markdown/) | `parseFromMarkdown`                                       |
| [独自形式への変換](https://cosense-toolbox.qaynam.dev/parser/compile/)        | `toPlainText` / `createCompiler`                          |
| [記法の拡張](https://cosense-toolbox.qaynam.dev/parser/extend/)               | `Extension` と独自のノード型                              |

## 互換性の方針

| 変更                                         | バージョン |
| :------------------------------------------- | :--------- |
| 新しいノード `type` の追加                   | minor      |
| 既存ノードへの optional フィールド追加       | minor      |
| オプションへの optional フィールド追加       | minor      |
| 既存ノードのフィールドの削除、型変更、必須化 | major      |
| `position` の意味論の変更                    | major      |
| ノード `type` 文字列のリネーム               | major      |

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
