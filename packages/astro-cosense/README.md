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
| `assets` | Cosense 上の画像とファイルを、ビルド時に取ってきてサイトの中に置く。`{ pat?, origin?, links? }`、または `false` で無効。既定は有効 |

## Cosense 上の画像とファイル

Cosense にアップロードした画像やファイル (`https://scrapbox.io/files/…`) とアイコン (`/api/pages/…/icon`) は、ビルド時に取ってきて `{base}/_cosense/` に置き、HTML の URL をそこに差し替える。

- これらのファイルは別のサイトの `<img>` からは読めない (`Cross-Origin-Resource-Policy: same-origin`)
- リダイレクト先の URL は数分で切れる
- そのため、静的なサイトで表示するにはサイトの中に置くしかない

```js
cosense({
  // 非公開プロジェクトの画像を取るときは PAT を渡す。Cosense への要求にだけ付ける
  assets: { pat: process.env.COSENSE_PAT },
})
```

- `.csn` / `.csnx` の中の画像は自動で差し替える
- ファイル名は `{元の URL のハッシュ}.{拡張子}`。アイコンは `{ハッシュ}_{ユーザー名}.{拡張子}`
  - 同じ URL は何度ビルドしても同じ名前になる
  - ハッシュから元の URL は分からないので、非公開プロジェクトのファイル ID は出ない
- 取ってきたファイルは Astro のキャッシュのディレクトリに残す
  - アップロードしたファイルは中身が変わらないので、次のビルドでは取り直さない
  - アイコンは差し替えられることがあるので、ビルドのたびに取り直す
  - 出力先には、そのビルドで使ったファイルだけを写す
- 取れなかったファイルは警告を出し、元の URL のまま出す
- dev サーバーでは、同じパスで配信する
- **非公開プロジェクトの画像も、公開するサイトに置かれる**。公開してよいものだけを書くこと

リンクした Cosense のファイル (`[https://scrapbox.io/files/x.zip]` など、`<a href>` になるもの) は、既定では元の URL のまま出す。
公開プロジェクトならクリックして開ける (Cross-Origin-Resource-Policy は画面の遷移には効かない)。
非公開プロジェクトのファイルは見に来た人が開けないので、`links: 'download'` で画像と同じくサイトに置く。

```js
cosense({
  assets: { pat: process.env.COSENSE_PAT, links: 'download' },
})
```

`toHtml` などで自分で描画するページは、`virtual:cosense-x/assets` の `localizeCosenseAssets` に HTML を通す。
アイコンの URL は `cosenseIconUrl` で作る。

```astro
---
import { cosenseIconUrl, fetchPageText } from '@cosense-toolbox/cosense-x/fetch'
import { parse } from '@cosense-toolbox/parser'
import { toHtml } from '@cosense-toolbox/parser/compile'
import { localizeCosenseAssets } from 'virtual:cosense-x/assets'

const project = 'help-jp'
const text = await fetchPageText(project, 'ブラケティング')
const html = await localizeCosenseAssets(
  toHtml(parse(text), { iconImageUrl: (icon) => cosenseIconUrl(project, icon.user) }),
)
---
<article class="cosense" set:html={html} />
```

差し替えられるのは、ページをビルド時に描画するとき (静的なページと prerender) と dev サーバーだけ。実行時に描画する SSR では元の URL のまま返す。

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
