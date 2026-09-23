# examples/astro-blog

`@cosense-toolbox/astro` を試すための小さなブログ。公開はしない。

```sh
bun install
bun run --filter '@cosense-toolbox/example-astro-blog' dev
```

パッケージ側を書き換えたときは、先に `bun run build` でパッケージをビルドしておく。

## 置いてあるもの

| パス | 内容 |
| :--- | :--- |
| `src/content/posts/*.csn` | 記事。frontmatter はファイル先頭の YAML と `code:frontmatter.yml` の両方の書き方を使っている |
| `src/content/posts/notes/components.csnx` | Svelte のコンポーネントを埋め込んだ記事 |
| `src/content/posts/draft.csn` | draft の記事。一覧に出ず、ここへのリンクはテキストになる |
| `src/pages/about.csnx` | `src/pages` に置いた `.csnx`。frontmatter の `layout` でレイアウトを指定している |
| `src/pages/posts/[slug].astro` | 記事と、逆リンク・2 hop リンク |
| `src/pages/tags/[tag].astro` | タグごとの記事一覧 |
| `src/pages/cosense.astro` | 公開プロジェクトのページを、ビルド時に Cosense の API から取ってきて描画する。ネットワークにつながらなければ案内だけを出す |
| `src/components/cosense.ts` | すべてのページに渡すコンポーネント |
| `src/urls.ts` | ページとタグの URL の規則。`astro.config.mjs` と各ページで共有する |
