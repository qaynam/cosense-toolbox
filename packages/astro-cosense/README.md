# @cosense-toolbox/astro

Cosense (旧 Scrapbox) の記法で書いた `.csn` / `.csnx` を、Astro のページと content collection で使うための統合。
中身は [`@cosense-toolbox/cosense-x`](../cosense-x) のコンパイラ。

> **beta**：公開 API はまだ変わりうる。

動く例は [`examples/astro-blog`](../../examples/astro-blog) にある。

## 設定

```js
// astro.config.mjs
import svelte from '@astrojs/svelte'
import cosense from '@cosense-toolbox/astro'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    svelte(),
    cosense({
      components: './src/components/cosense.ts',
      pageUrl: (page) => `/posts/${encodeURIComponent(page.slug)}/`,
      tagUrl: (tag) => `/tags/${encodeURIComponent(tag)}/`,
      unresolved: 'warn',
    }),
  ],
})
```

| オプション | 内容 |
| :--- | :--- |
| `components` | すべてのページに渡すコンポーネントを default export するモジュールの、プロジェクトのルートからのパス |
| `pageUrl` | リンク先のページの URL。`{ id, title, slug }` を受け取る。`id` はプロジェクトのルートからのパス |
| `tagUrl` `projectUrl` `unresolved` | `compile` の同名のオプションと同じ |
| `rehypePlugins` `classNames` `showPads` `iconImageUrl` `title` `parseOptions` | 同上 |

## content collection

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{csn,csnx}', base: './src/content/posts' }),
})

export const collections = { posts }
```

`data` には frontmatter に加えて `title` / `slug` / `description` / `image` / `tags` / `draft` が入る。
Cosense では 1 行目がタイトルなので、frontmatter に書かなくても `title` がある。
`slug` が entry の id になる。

```astro
---
import { render } from 'astro:content'
const { Content } = await render(post)
---
<Content />
```

## ページ

`src/pages` に `.csn` / `.csnx` を置くと、そのままページになる。
frontmatter の `layout` にレイアウトの `.astro` を指定すると、本文をその default のスロットに入れる。
レイアウトには `frontmatter` と `metadata` が props で渡る。

```
---
layout: ../layouts/Page.astro
---
このサイトについて
本文
```

## リンクグラフ

`virtual:cosense-x/graph` から、`src` の下のすべての `.csn` / `.csnx` のリンクグラフを読める。
グラフの id は、content collection の entry の `filePath` と同じ形 (プロジェクトのルートからのパス)。

```astro
---
import graph from 'virtual:cosense-x/graph'
const backlinks = graph.backlinks[post.filePath]
const twoHop = graph.twoHop[post.filePath]
---
```

## コンポーネント

`.csnx` の `<Name />` の行には、`components` に指定したモジュールか、`<Content components={...} />` で渡したものが使われる。
Astro の中で描画されるので、Svelte などのコンポーネントも渡せる。

ブラウザで動かすための `client:*` ディレクティブは `.astro` の中でしか付けられない。
`.astro` のコンポーネントで包んでから渡す。

```astro
---
// CounterIsland.astro
import Counter from './Counter.svelte'
---
<Counter client:load {...Astro.props} />
```

## 仕組み

- `.csn` / `.csnx` を Vite のプラグインで JS にする。`jsxImportSource` は `astro`
- リンクの解決には全ページのタイトルが要る。そのため、ビルドの最初に `src` の下を全部読んで索引を作る。dev サーバーでは、どれか 1 ページが変わると索引を作り直して再読み込みする
- 描画には `astro:jsx` レンダラを使う。`@astrojs/mdx` と同じものなので、両方入れてもぶつからない
- ページの拡張子と content collection の形式の登録には、`@astrojs/mdx` も使っている Astro の非公開のフック (`addPageExtension` / `addContentEntryType`) を使っている。Astro の更新で動かなくなる可能性がある

## ライセンス

MIT。
