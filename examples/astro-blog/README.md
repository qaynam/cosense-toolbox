# examples/astro-blog

`@cosense-toolbox/astro` の動作を試すブログアプリです。公開用のサイトではありません。

**使い方 → <https://cosense-toolbox.qaynam.dev/astro-blog/>**

このサンプルはリポジトリのワークスペース外にあります。`@cosense-toolbox/*` は npm に公開された版を使うため、利用者と同じ依存関係で動作します。

```sh
cd examples/astro-blog
bun install
bun run dev
```

## 手元のパッケージで試す

公開前の変更を試す場合は、対象パッケージをビルドして `bun link` で接続します。`package.json` と `bun.lock` は変更されません。

```sh
# パッケージ側 (例: packages/tailwind)
bun run build
bun link

# examples/astro-blog
bun link @cosense-toolbox/tailwind
```

npm に公開されたバージョンへ戻す場合は、`bun install --force` を実行します。

## 置いてあるもの

| パス                                      | 内容                                                                                                                       |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `src/content/posts/*.csn`                 | 記事。frontmatter はファイル先頭の YAML に書いている                                                                       |
| `src/content/posts/notes/components.csnx` | Svelte のコンポーネントを埋め込んだ記事                                                                                    |
| `src/content/posts/draft.csn`             | draft の記事。一覧に出ず、ここへのリンクはテキストになる                                                                   |
| `src/pages/about.csnx`                    | `src/pages` に置いた `.csnx`。frontmatter の `layout` でレイアウトを指定している                                           |
| `src/pages/posts/[slug].astro`            | 記事と、逆リンク・2 hop リンク                                                                                             |
| `src/pages/tags/[tag].astro`              | タグごとの記事一覧                                                                                                         |
| `src/pages/cosense.astro`                 | 公開プロジェクトのページを、ビルド時に Cosense の API から取ってきて描画する。ネットワークにつながらなければ案内だけを出す |
| `src/components/cosense.ts`               | すべてのページに渡すコンポーネント                                                                                         |
| `src/styles/global.css`                   | Tailwind CSS と `@cosense-toolbox/tailwind`。記事は `class="cosense"` の要素で包んでいる                                   |
| `src/urls.ts`                             | ページとタグの URL の規則。`astro.config.mjs` と各ページで共有する                                                         |
