# @cosense-toolbox/lsp

> **beta.** 設定の名前や出力の形はまだ変わりえます。

`.csn` / `.csnx` に対応する Language Server と、サイト内のリンクをまとめて検査する `check` コマンドを提供します。
どちらも [`@cosense-toolbox/parser`](../parser) で解析するため、記法の解釈が Cosense の描画とそろいます。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/lsp/>**

## Language Server

```sh
csn-lsp --stdio
```

- 色付け (semantic tokens)
- `[` の中と `#` の後での、ページの題名の補完。候補の選び方と並べ方は Cosense Web と同じで、まだ無いページへのリンクも候補に出す
- `[ページ名]` からそのページのファイルへの定義ジャンプ
- 存在しないページへのリンクの診断
- Google マップの URL を、Cosense の地図の記法 (`[N35.68,E139.76,Z15]`) に変える提案とクイックフィックス

設定はエディターの `initialization_options` で渡します。いずれも省略できます。

| 設定              | 内容                                                                                                                                                                       | 既定               |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------- |
| `sources`         | ページを読む場所。ワークスペースからの相対パス                                                                                                                             | ワークスペース全体 |
| `unresolvedLinks` | 存在しないページへのリンクの診断。`off` / `hint` / `information` / `warning` / `error`                                                                                     | `warning`          |
| `mediaRoot`       | サイトがファイルを配るディレクトリ (ワークスペースからの相対パス)。これがあるワークスペースでは、`[:/images/a.png]` をページへのリンクではなく、そこに置いた画像として読む | `public`           |
| `mapLinks`        | 地図の記法にできる Google マップの URL の診断。`off` / `hint` / `information` / `warning` / `error`                                                                        | `information`      |
| `frontmatter`     | 1 行目の `---` を frontmatter (YAML) として飛ばすか                                                                                                                        | `true`             |

## Google マップの URL

Cosense Web は、Google マップの URL を貼ると地図の記法 (`[N35.68,E139.76,Z15]`) に書き換えます。
ほかのエディターで書くときは書き換わらないので、同じ書き換えを診断とクイックフィックスで提案します。
URL の座標とズーム、場所の名前 (`/place/東京駅/`) をそのまま使い、Cosense Web と同じ記法にします。

URL のまま残したいときは、次のどれかにすると提案されません。

- `` `https://www.google.com/maps/…` `` のようにコードで囲む
- `[東京駅 https://www.google.com/maps/…]` のようにラベルを付ける
- 設定の `mapLinks` を `off` にする (クイックフィックスは使えるまま)

`check` はこの診断を出しません。URL のまま残すのも正しい書き方で、ビルドを止める理由にはならないためです。

## check

エディター上の診断と同じ判定で、指定したディレクトリ内のページリンクを検査します。CI での利用を想定しています。

```sh
csn-lsp check src/content src/pages
# src/content/posts/a.csn:5:3 error リンク先のページが見つからない: [無いページ]
```

- 引数に指定したディレクトリ以下の `.csn` / `.csnx` を読みます。省略した場合は、カレントディレクトリを対象にします。
- ページ名は各ファイルの 1 行目から取得します。照合では大文字・小文字と空白・`_` の違いを無視します。
- `[! 注意]` のような文字装飾は Cosense Web と同じ規則で判定し、リンクとして扱いません。
- エラーが1件以上ある場合は終了コード `1`、エラーがない場合は `0`、オプションが不正な場合は `2` を返します。

| オプション                   | 内容                                                 | 既定    |
| :--------------------------- | :--------------------------------------------------- | :------ |
| `--unresolved-links <level>` | `off` / `hint` / `information` / `warning` / `error` | `error` |
| `--no-frontmatter`           | 1 行目の `---` を frontmatter ではなく題名として読む |         |

`check` はリンク切れを見つけたらビルドを止めるため、重大度の既定値を `error` にしています。報告だけにしたい場合は `--unresolved-links warning` を指定してください (終了コードは `0` になります)。

## ライブラリとして

エディタのプラグインなどから、部品として使える。

- `@cosense-toolbox/lsp/tokens`: `computeTokens` / `encodeTokens` / `legendOf` など
  - `notations` で装飾の記号に名前を付け、その名前のトークンとして送れる (`[! 注意]` の `!` に `warning` など)。
    記号は Cosense の文字装飾の記号 (`!"#%&'()*+,-./{|}<>_~=`) に限る。ほかの記号 (`@` など) の括弧はリンクのまま
  - `frontmatter: false` で、1 行目の `---` を YAML として飛ばさずに読める
  - `encodeTokens` は、legend にトークン自身の型名 (`title`、`link` など) か notation の名前があればその名前で送り、
    無ければ LSP 標準の型 (`namespace`、`function` など) に直して送る。既定の legend (`LEGEND`) は LSP 標準の型だけなので、
    VS Code や Zed のように標準の型で色を付けるエディタにはそのまま渡せる。自前の名前で色を付けるクライアントは、
    `encodeTokens(tokens, [...TOKEN_TYPES, ...names])` のように自前の legend を渡す
- `@cosense-toolbox/lsp/completion`: `detectCompletion` / `detectCompletionInDocument` / `completionItems` / `definitionOf` など
  - `detectCompletionInDocument` は、タイトル行と、コードやコマンドの行 (`$ ls`) では補完の位置とみなさない
- `@cosense-toolbox/lsp/suggest`: リンクの候補を、Cosense Web のエディタと同じ規則で選んで並べる。どれも入出力の無い関数
  - `buildCandidateIndex(entries)`: ページ (`title` / `updated` / `image` / `links`) から候補を作る。リンク先にしかない題名も候補になる
  - `rankCandidates(index, query, options)`: 空白で区切った語がすべて入る題名を、短い順 (同じ長さなら新しい順) に並べる。
    見つかったものが少なければ、3 文字以上の入力で 1 文字違いの題名を足す。編集中のページと、入力と同じ題名は出さない
  - `mergeVectorPages(ranked, pages, index, query)`: ベクトル検索の結果のうち近いものを、Cosense Web と同じく上位 6 件の中に混ぜる
  - `iconKeys(text)`: ページが使っているアイコン。`rankCandidates` の `icons` に渡すと、そのアイコンのページが先頭に来る
  - `Asearch(pattern)`: 1〜3 文字違いまでを許す、あいまいな文字列の照合
- `@cosense-toolbox/lsp/link`: `linkAt(text, position, parseOptions?)` で、カーソルの下のリンクと、その行き先を返す
  - ページ (`[ページ]`、`#タグ`、`[/project/ページ]`、アイコンの `[taro.icon]` と `[[taro.icon]]`) は `kind: "page"`。
    別のプロジェクトなら `project`、`[ページ#<行 ID>]` なら `lineId` が付く
  - 外部リンクと画像は `kind: "url"`。リンク付きの画像は、画像ではなくリンクの URL
  - `range` は記法全体の範囲 (UTF-16)。行き先をファイルや Web のページに解決するのは、呼び出し側の仕事
