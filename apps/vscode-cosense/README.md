# VS Code 拡張: Cosense

`.csn` / `.csnx` を VS Code で編集するための拡張です。

**使い方 → <https://cosense-toolbox.qaynam.dev/vscode/>**

- 色付け: [`@cosense-toolbox/textmate`](../../packages/textmate) の TextMate 文法で色を付け、
  [`@cosense-toolbox/lsp`](../../packages/lsp) の semantic tokens で上書きする。サーバーが起動する前から色が付く
- `[` の中と `#` の後での、ページの題名の補完。候補の選び方と並べ方は Cosense Web と同じ
- `[ページ名]` からそのページのファイルへの定義ジャンプ
- 存在しないページへのリンクの診断
- `[` を打つと `]` を補う

Language Server は拡張に同梱されているため、`csn-lsp` を別途インストールする必要はありません。

## 開発版を試す

1. ビルドする。

   ```sh
   bun install
   bunx turbo run build --filter=vscode-cosense
   ```

2. `apps/vscode-cosense` を VS Code で開き、F5 (`Run the extension`) を押す。
   拡張を読み込んだ別のウィンドウが開くので、そこで `.csn` / `.csnx` のあるフォルダを開く。

   コマンドからなら `code --extensionDevelopmentPath=apps/vscode-cosense examples/astro-blog` でも同じ。

## VSIX をインストールする

普段使っている VS Code に導入する場合は、拡張を `.vsix` にパッケージしてからインストールします。

```sh
cd apps/vscode-cosense
bun run package                                  # vscode-cosense-0.1.0.vsix ができる
code --install-extension vscode-cosense-0.1.0.vsix
```

`.vsix` に入るのは `dist/`・`syntaxes/`・設定ファイルだけ (`.vscodeignore`)。拡張と Language Server は依存ごと
`dist/` にまとめてあるので、`node_modules` は入れない (`--no-dependencies`)。

## 設定

| 設定                      | 内容                                                                                                | 既定               |
| :------------------------ | :-------------------------------------------------------------------------------------------------- | :----------------- |
| `cosense.sources`         | ページを読む場所。ワークスペースからの相対パス                                                      | ワークスペース全体 |
| `cosense.unresolvedLinks` | 存在しないページへのリンクの診断。`off` / `hint` / `information` / `warning` / `error`              | `warning`          |
| `cosense.mediaRoot`       | サイトがファイルを配るディレクトリ。これがあれば `[:/images/a.png]` を画像として読む                | `public`           |
| `cosense.mapLinks`        | 地図の記法にできる Google マップの URL の診断。`off` / `hint` / `information` / `warning` / `error` | `information`      |
| `cosense.frontmatter`     | 1 行目の `---` を frontmatter (YAML) として飛ばすか                                                 | `true`             |
| `cosense.server.path`     | 使う Language Server のパス。空なら同梱のものを使う                                                 | 空                 |

設定を変更した場合は、Language Server を再起動すると反映されます。

`examples/astro-blog` の設定は、次のとおり (`.vscode/settings.json`)。

```json
{
  "cosense.unresolvedLinks": "error"
}
```

## 分かっていないこと

- Marketplace への公開の準備はまだしていない。`publisher` は仮の値
- 色はテーマによって変わる。semantic tokens を無効にしているテーマでは、TextMate 文法の色だけになる
