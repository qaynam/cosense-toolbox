# examples/astro-blog

`@cosense-toolbox/astro` を試すための小さなブログ。公開はしない。

リポジトリのワークスペースには入っていない。`@cosense-toolbox/*` は npm に公開された版を使うので、利用者と同じ入れ方で動く。

```sh
cd examples/astro-blog
bun install
bun run dev
```

## 手元のパッケージで試す

公開前の変更を試すときは、そのパッケージをビルドして `bun link` でつなぐ。`package.json` と `bun.lock` は書き換わらない。

```sh
# パッケージ側 (例: packages/tailwind)
bun run build
bun link

# examples/astro-blog
bun link @cosense-toolbox/tailwind
```

npm の版に戻すときは `bun install --force`。

## 置いてあるもの

| パス                                      | 内容                                                                                                                       |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `src/content/posts/*.csn`                 | 記事。frontmatter はファイル先頭の YAML と `code:frontmatter.yml` の両方の書き方を使っている                               |
| `src/content/posts/notes/components.csnx` | Svelte のコンポーネントを埋め込んだ記事                                                                                    |
| `src/content/posts/draft.csn`             | draft の記事。一覧に出ず、ここへのリンクはテキストになる                                                                   |
| `src/pages/about.csnx`                    | `src/pages` に置いた `.csnx`。frontmatter の `layout` でレイアウトを指定している                                           |
| `src/pages/posts/[slug].astro`            | 記事と、逆リンク・2 hop リンク                                                                                             |
| `src/pages/tags/[tag].astro`              | タグごとの記事一覧                                                                                                         |
| `src/pages/cosense.astro`                 | 公開プロジェクトのページを、ビルド時に Cosense の API から取ってきて描画する。ネットワークにつながらなければ案内だけを出す |
| `src/components/cosense.ts`               | すべてのページに渡すコンポーネント                                                                                         |
| `src/styles/global.css`                   | Tailwind CSS と `@cosense-toolbox/tailwind`。記事は `class="cosense"` の要素で包んでいる                                   |
| `src/urls.ts`                             | ページとタグの URL の規則。`astro.config.mjs` と各ページで共有する                                                         |
