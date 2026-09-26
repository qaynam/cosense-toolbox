# @cosense-toolbox/lsp

> **beta.** 設定の名前や出力の形はまだ変わりえます。

`.csn` / `.csnx` の Language Server と、同じ判定でサイト全体を調べる `check` コマンド。
どちらも [`@cosense-toolbox/parser`](../parser) で読むので、記法の解釈が Cosense の描画とずれない。

## Language Server

```sh
csn-lsp --stdio
```

- 色付け (semantic tokens)
- `[` の中と `#` の後での、ページの題名の補完
- `[ページ名]` からそのページのファイルへの定義ジャンプ
- 存在しないページへのリンクの診断

設定はエディタの `initialization_options` で渡す。どれも省略できる。

| 設定              | 内容                                                                                   | 既定               |
| :---------------- | :------------------------------------------------------------------------------------- | :----------------- |
| `sources`         | ページを読む場所。ワークスペースからの相対パス                                         | ワークスペース全体 |
| `decorations`     | サイトの `customDecorations` と同じ記号。`[! 注意]` をリンクではなく装飾記法として読む | なし               |
| `unresolvedLinks` | 存在しないページへのリンクの診断。`off` / `hint` / `information` / `warning` / `error` | `warning`          |
| `frontmatter`     | 1 行目の `---` を frontmatter (YAML) として飛ばすか                                    | `true`             |

## check

エディタの診断と同じ判定で、サイトのすべてのページのリンクを調べる。CI で使う想定。

```sh
csn-lsp check src/content src/pages --decorations '|!~#'
# src/content/posts/a.csn:5:3 error リンク先のページが見つからない: [無いページ]
```

- 引数のディレクトリの下の `.csn` / `.csnx` を読む。省略すると今いるディレクトリを読む
- ページの題名はファイルの 1 行目。大文字小文字と、空白と `_` の違いは無視する
- エラーが 1 件でもあれば終了コード 1、無ければ 0。オプションの誤りは 2

| オプション                   | 内容                                                 | 既定    |
| :--------------------------- | :--------------------------------------------------- | :------ |
| `--unresolved-links <level>` | `off` / `hint` / `information` / `warning` / `error` | `error` |
| `--decorations <markers>`    | サイトの装飾記法の記号を 1 つの文字列で (`'\|!~#'`)  | なし    |
| `--no-frontmatter`           | 1 行目の `---` を frontmatter ではなく題名として読む |         |

`check` の既定が `error` なのは、ビルドを止めるための道具だから。報告だけにしたいときは
`--unresolved-links warning` にする (終了コードは 0 になる)。

## ライブラリとして

エディタのプラグインなどから、部品として使える。

- `@cosense-toolbox/lsp/tokens`: `computeTokens` / `encodeTokens` / `legendOf` / `withNotations` など
  - `notations` で独自の記法 (記号と、送るトークンの型の名前) を足せる
  - `frontmatter: false` で、1 行目の `---` を YAML として飛ばさずに読める
- `@cosense-toolbox/lsp/completion`: `detectCompletion` / `completionItems` / `definitionOf` など
