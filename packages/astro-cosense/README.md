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
| `rehypePlugins` `handlers` `classNames` `showPads` `iconImageUrl` `title` `parseOptions` | 同上 |
| `syntaxHighlight` | コードブロックの色付け。既定の `'astro'` は `markdown.shikiConfig` に従う。`false` で無効、関数で自前の色付け。[下を参照](#コードブロックの色付け) |
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

## コードブロックの色付け

`.csn` / `.csnx` のコードブロック (`code:hello.js`) は、`.md` / `.mdx` と同じく Astro の `markdown.syntaxHighlight` と `markdown.shikiConfig` の設定で shiki が色付けする。
`components` に登録しなくてよい。

```js
export default defineConfig({
  markdown: { shikiConfig: { theme: 'github-light' } },
  integrations: [cosense()],
})
```

- 言語はファイル名の拡張子から決める。`code:hello.js` なら `js`、`code:python` なら `python`
- shiki が知らない言語と `excludeLangs` の言語は、色付けせずに出す
- `theme` / `themes` / `defaultColor` / `langs` / `langAlias` / `transformers` を使う。`wrap` は使わない。長い行は `@cosense-toolbox/style` が折り返す
- `markdown.syntaxHighlight` が `'prism'` のときは色付けしない (相当するものが無い)

`syntaxHighlight: false` で色付けをやめる。関数を渡すと、shiki の代わりにそれで色付けする。形は `compile` の `highlight` と同じ。

```js
cosense({
  syntaxHighlight: (code, language) => myHighlighter(code, language), // hast か null を返す
})
```

`toHtml` で自分で描画するページは、`toHtml` の `highlight` に shiki を直接渡す。
テーマなどの設定を 1 つのファイルにまとめ、`astro.config.mjs` とページの両方から読むと、`.md` / `.csn` と見た目が揃う。

```ts
// src/shiki.ts
import type { HastHighlighter } from '@cosense-toolbox/parser/compile'
import type { ShikiConfig } from 'astro'
import { createHighlighter } from 'shiki'

export const shikiConfig = { theme: 'github-light' } satisfies Partial<ShikiConfig>

/** toHtml は highlight を同期で呼ぶので、使う言語は先に読み込んでおく */
export const createCodeHighlight = async (langs: string[]): Promise<HastHighlighter> => {
  const shiki = await createHighlighter({ themes: [shikiConfig.theme], langs })
  // shiki の hast はそのまま返してよい。<pre><code> は剥がされ、テーマの色はコードブロックに移る
  return (code, lang) =>
    shiki.getLoadedLanguages().includes(lang)
      ? shiki.codeToHast(code, { lang, theme: shikiConfig.theme })
      : null // 読み込んでいない言語は色付けしない
}
```

```js
// astro.config.mjs
import { shikiConfig } from './src/shiki.ts'

export default defineConfig({
  markdown: { shikiConfig },
  integrations: [cosense()],
})
```

```astro
---
import { parse } from '@cosense-toolbox/parser'
import { toHtml } from '@cosense-toolbox/parser/compile'
import { createCodeHighlight } from '../shiki'

const highlight = await createCodeHighlight(['js', 'ts'])
const html = toHtml(parse(text), { highlight })
---
<article class="cosense" set:html={html} />
```

### 行番号

行番号の要素は出さないので、CSS カウンタで付ける (shiki にも行番号のオプションは無い)。

```css
/* shiki で色付けしたブロックは行ごとの span.line を、色付けしていないブロックは 1 行ずつの div を数える */
.cosense .code-body.highlight,
.cosense .line.code-block:has(> .code-start) {
  counter-reset: line;
}

.cosense .code-body.highlight > .line::before,
.cosense .line.code-block > .code-body:not(.highlight)::before {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 2em;
  margin-right: 1em;
  text-align: right;
  color: #94a3b8;
  user-select: none; /* コピーしたときに番号が入らないように */
}
```

- 色付けしていないブロック (shiki が知らない言語) は、まとめる親の要素が無い。ヘッダ行 (ファイル名) でカウンタを戻すと、後ろに並ぶ本体行で数えられる
- `toHtml` に shiki の `structure: 'inline'` の出力を渡すと、行が `span.line` にならず `<br>` で区切られるので、行番号は付かない。上の `createCodeHighlight` のように `codeToHast` をそのまま返す

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
