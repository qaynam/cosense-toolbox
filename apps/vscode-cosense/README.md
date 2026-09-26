# VS Code 拡張: Cosense

`.csn` と `.csnx` を VS Code で書くための拡張。

- 色付け: [`@cosense-toolbox/textmate`](../../packages/textmate) の TextMate 文法で色を付け、
  [`@cosense-toolbox/lsp`](../../packages/lsp) の semantic tokens で上書きする。サーバーが起動する前から色が付く
- `[` の中と `#` の後での、ページの題名の補完
- `[ページ名]` からそのページのファイルへの定義ジャンプ
- 存在しないページへのリンクの診断
- `[` を打つと `]` を補う

Language Server は拡張の中に同梱しているので、`csn-lsp` を別に入れる必要はない。

## 試す

1. ビルドする。

   ```sh
   bun install
   bunx turbo run build --filter=vscode-cosense
   ```

2. `apps/vscode-cosense` を VS Code で開き、F5 (`Run the extension`) を押す。
   拡張を読み込んだ別のウィンドウが開くので、そこで `.csn` / `.csnx` のあるフォルダを開く。

   コマンドからなら `code --extensionDevelopmentPath=apps/vscode-cosense examples/astro-blog` でも同じ。

## インストールする

いつもの VS Code に入れるなら、`.vsix` にまとめてから入れる。

```sh
cd apps/vscode-cosense
bun run package                                  # vscode-cosense-0.1.0.vsix ができる
code --install-extension vscode-cosense-0.1.0.vsix
```

`.vsix` に入るのは `dist/`・`syntaxes/`・設定ファイルだけ (`.vscodeignore`)。拡張と Language Server は依存ごと
`dist/` にまとめてあるので、`node_modules` は入れない (`--no-dependencies`)。

## 設定

| 設定                      | 内容                                                                                   | 既定               |
| :------------------------ | :------------------------------------------------------------------------------------- | :----------------- |
| `cosense.sources`         | ページを読む場所。ワークスペースからの相対パス                                         | ワークスペース全体 |
| `cosense.decorations`     | サイトの `customDecorations` と同じ記号。`[! 注意]` をリンクではなく装飾記法として読む | なし               |
| `cosense.unresolvedLinks` | 存在しないページへのリンクの診断。`off` / `hint` / `information` / `warning` / `error` | `warning`          |
| `cosense.frontmatter`     | 1 行目の `---` を frontmatter (YAML) として飛ばすか                                    | `true`             |
| `cosense.server.path`     | 使う Language Server のパス。空なら同梱のものを使う                                    | 空                 |

設定を変えると、Language Server を起動し直して反映する。

`examples/astro-blog` の設定は、次のとおり (`.vscode/settings.json`)。

```json
{
  "cosense.decorations": ["|", "!", "~", "#"],
  "cosense.unresolvedLinks": "error"
}
```

## 分かっていないこと

- Marketplace への公開の準備はまだしていない。`publisher` は仮の値
- 色はテーマによって変わる。semantic tokens を無効にしているテーマでは、TextMate 文法の色だけになる
