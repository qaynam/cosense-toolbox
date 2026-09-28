# Cosense Toolbox

Cosense (旧 Scrapbox) の記法を、解析・表示・編集するためのオープンソースツール群です。TypeScript パッケージ、Astro 統合、エディター連携、テーマ作成ツールを開発しています。

使い方やパッケージの選び方は [ドキュメントサイト](https://cosense-toolbox.qaynam.dev/docs/) をご覧ください。

## パッケージとアプリ

| 名前                                                                                                                                    | 役割                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`packages/parser`](./packages/parser) · [`@cosense-toolbox/parser`](https://www.npmjs.com/package/@cosense-toolbox/parser)             | Cosense 記法を、位置情報つきの AST に変換します。                              |
| [`packages/cosense-x`](./packages/cosense-x) · [`@cosense-toolbox/cosense-x`](https://www.npmjs.com/package/@cosense-toolbox/cosense-x) | `.csn` / `.csnx` ページを JSX モジュールへコンパイルします。                   |
| [`packages/astro-cosense`](./packages/astro-cosense) · [`@cosense-toolbox/astro`](https://www.npmjs.com/package/@cosense-toolbox/astro) | `.csn` / `.csnx` を Astro のページや content collection で使えるようにします。 |
| [`packages/style`](./packages/style) · [`@cosense-toolbox/style`](https://www.npmjs.com/package/@cosense-toolbox/style)                 | パーサーが出力する HTML に適用する CSS を提供します。                          |
| [`packages/tailwind`](./packages/tailwind) · [`@cosense-toolbox/tailwind`](https://www.npmjs.com/package/@cosense-toolbox/tailwind)     | Tailwind CSS から Cosense の記法ごとにスタイルを調整できます。                 |
| [`packages/lsp`](./packages/lsp) · [`@cosense-toolbox/lsp`](https://www.npmjs.com/package/@cosense-toolbox/lsp)                         | `.csn` / `.csnx` の補完、定義ジャンプ、リンク診断を提供します。                |
| [`packages/textmate`](./packages/textmate) · [`@cosense-toolbox/textmate`](https://www.npmjs.com/package/@cosense-toolbox/textmate)     | Shiki や VS Code で使える TextMate 文法を提供します。                          |
| [`apps/vscode-cosense`](./apps/vscode-cosense)                                                                                          | VS Code で `.csn` / `.csnx` を編集するための拡張です。                         |
| [`apps/zed-cosense`](./apps/zed-cosense)                                                                                                | Zed で semantic tokens による色付けを行う拡張です。                            |
| [`apps/web`](./apps/web)                                                                                                                | パッケージのドキュメントサイトと、Cosense テーマの作成ツールです。             |
| [`examples/astro-blog`](./examples/astro-blog)                                                                                          | Astro 統合を使ったブログのサンプルです。                                       |
| [`tools/release`](./tools/release)                                                                                                      | npm パッケージのバージョン更新と公開を補助します。                             |

npm に公開しているライブラリは beta です。安定するまでは、利用するバージョンを固定してください。

## 開発を始める

Bun 1.3 以降と Node.js 20 以降が必要です。

```sh
bun install
bun run dev
```

すべてのパッケージをビルドするには次を実行します。

```sh
bun run build
```

テストと型チェックは `bun run test`、`bun run typecheck` で実行できます。個別パッケージのコマンドは、それぞれの README を参照してください。

## ライセンスと位置づけ

各パッケージは MIT ライセンスです。Cosense (旧 Scrapbox) の非公式プロジェクトであり、開発元の Helpfeel 社とは関係がなく、公認も受けていません。
