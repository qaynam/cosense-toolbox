# Zed 拡張: Cosense

`.csn` と `.csnx` に色を付ける。色は tree-sitter ではなく、
[`@cosense-toolbox/language-server`](../../packages/language-server) が返す
**LSP の semantic tokens** から来る。`@cosense-toolbox/parser` をそのまま使うので、
記法の解釈が Cosense の描画とずれない。

## 入れる

1. サーバーをビルドする。

   ```sh
   bun install
   bun run --filter '@cosense-toolbox/language-server' build
   ```

2. Zed で `zed: install dev extension` を実行し、このディレクトリを選ぶ。
   Rust が要る（Zed が `cargo` と `rustup target add wasm32-wasip1` を呼ぶ）。

3. **`settings.json` に次を足す。** どちらも拡張の側からは既定値を変えられない。

   ```jsonc
   {
     "languages": {
       "Cosense": {
         "semantic_tokens": "full",
         "remove_trailing_whitespace_on_save": false,
       },
       "Cosense X": {
         "semantic_tokens": "full",
         "remove_trailing_whitespace_on_save": false,
       },
     },
   }
   ```

   - `semantic_tokens`: Zed の既定は `"off"` なので、これをしないと色が付かない。
     `"full"` は tree-sitter を使わず semantic tokens だけで色を決める。この拡張には
     grammar が無いので、この指定でよい。
   - `remove_trailing_whitespace_on_save`: Zed は既定で、保存時に行末の空白を消す。
     Cosense ではインデントの空白だけの行もコードブロックや表の一部で、空白を消すと
     本当の空行になり、そこでブロックが終わってしまう。

## 存在しないページへのリンク

`[ページ名]` のリンク先に、その題名のファイルが無ければ診断を出す。題名はファイルの 1 行目で、
大文字小文字と、空白と `_` の違いは無視する。`#タグ` と `[/別プロジェクト/ページ]` は対象にしない。

強さは `initialization_options` の `unresolvedLinks` で変えられる。既定は `"warning"`。

```jsonc
{
  "lsp": {
    "cosense-language-server": {
      // "off" | "hint" | "information" | "warning" | "error"
      "initialization_options": { "unresolvedLinks": "error" },
    },
  },
}
```

ワークスペースのページは起動時と保存のたびに読み直す。新しいページは、保存するまで存在しないものとして扱う。

## 色を変える

トークンの名前は Cosense のものにしてある（`link`、`quote`、`bold` など）。
`semantic_token_rules` で好きな色に寄せられる。

```jsonc
{
  "semantic_token_rules": [
    { "token_type": "title", "style": ["title"] },
    { "token_type": "link", "style": ["link_text"] },
    { "token_type": "externalLink", "style": ["link_text"] },
    { "token_type": "projectLink", "style": ["link_text"] },
    { "token_type": "hashtag", "style": ["attribute"] },
    { "token_type": "icon", "style": ["link_text"] },
    { "token_type": "image", "style": ["link_text"] },
    { "token_type": "code", "style": ["text.literal"] },
    { "token_type": "codeBlock", "style": ["text.literal"] },
    { "token_type": "formula", "style": ["text.literal"] },
    { "token_type": "quote", "style": ["comment"] },
    { "token_type": "table", "style": ["text.literal"] },
    { "token_type": "frontmatter", "style": ["comment"] },
    { "token_type": "component", "style": ["tag"] },
    { "token_type": "attribute", "style": ["attribute"] },
    { "token_type": "attributeValue", "style": ["string"] },
    { "token_type": "expression", "style": ["variable"] },
    { "token_type": "bold", "font_weight": "bold" },
    { "token_type": "bold2", "font_weight": "bold" },
    { "token_type": "bold3", "font_weight": "bold" },
    { "token_type": "italic", "font_style": "italic" },
    { "token_type": "strike", "style": ["comment"] },
    { "token_type": "underline", "style": ["emphasis"] },
  ],
}
```

既定のルールは `zed: show default semantic token rules` で見られる。

## 分かっていないこと

- **grammar を持たない言語を Zed が受け付けるか、まだ実機で確かめていない。**
  拒まれたら `extension.toml` に最小の grammar を足す。色は semantic tokens から来る
  ので、grammar は形だけでよい
- 補完と定義ジャンプは出していない。chatora のサーバーはそれらを `cosense://` の URI
  前提で解決しており、手元のファイルには別の解決が要る
