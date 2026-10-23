# @cosense-toolbox/astro

Cosense (旧 Scrapbox) の記法で書いた `.csn` / `.csnx` を、Astro のページや content collection で使うための統合です。
コンパイルには [`@cosense-toolbox/cosense-x`](../cosense-x) を使います。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/astro/>**

> **beta**：公開 API はまだ変わりうる。

### 1.0.0 の変更

- `renderOptions` に `classPrefix` を渡せるようにした (`@cosense-toolbox/parser` 1.0.0 の `toHast` のオプション)。
  既定の class 名に付ける接頭辞で、CSS フレームワークの `.link` などとぶつかるときに使う。
- 出力の既定の class 名は、parser 1.0.0 に合わせて一部が Cosense Web のエディタと同じ名前に変わる (内部リンクは `page-link`、表は `table-block`、タイトルは `line line-title` など)。
  対応は [parser の README](../parser/README.md#100-の変更) の表のとおり。
- **破壊的変更:** `pageUrl` を渡さないときのリンク先を変えた。
  今までは、どのページへのリンクも cosense-x の既定の `/{slug}` で、サイトの `base` が付かず、`src/pages` のページの URL とも合わなかった。
  - `src/pages` (正しくは `srcDir` の下の `pages`) のページへは、Astro がそのファイルを出す URL にする。
    `src/pages/a/b.csnx` なら `{base}/a/b/`、`src/pages/a/index.csnx` なら `{base}/a/`。[下を参照](#リンク先)
  - それ以外のページ (content collection など) へは `{base}/{slug}`。`base` が無いサイトでは今までと同じ
  - `pageUrl` を渡しているサイトは変わらない
  - 今までどおり `/{slug}` にしたいときは、`` pageUrl: (page) => `/${encodeURIComponent(page.slug)}` `` を渡す
  - `src/pages` のページの URL をファイルのパスから組み立てていた `pageUrl` は、消せることがある。同じ URL になるかは、ビルドした HTML のリンクを比べて確かめる
- **破壊的変更:** `renderOptions.handlers` / `renderOptions.extensions` の中の `ctx.options.pageUrl` が、この統合が出すのと同じリンク先を返すようになった (cosense-x の変更)。
  今までは parser の既定の `/{title}` を返していた。それが要るハンドラは、`@cosense-toolbox/parser/html` の `defaultPageUrl(title)` を呼ぶ。
- README の誤りを直した。`renderOptions` が parser の `toHast` にそのまま渡るのではないこと、レイアウトに `file` も渡ること、`pageUrl` の `id` が null になりうることを書いた。

### 0.1.0-beta.10 の変更

- Cosense のファイルを取るのに、`@cosense-toolbox/cosense-x/fetch` ではなく `@cosense-toolbox/api` を使うようになった。
  統合のオプション (`assets.pat` など) は変わらない。
- 自分で描画するページの例を、`@cosense-toolbox/api` の `createCosenseApi().getPageText` と `cosenseIconUrl` に書き換えた
  (`@cosense-toolbox/cosense-x/fetch` を消したため)。

### 0.1.0-beta.9 の変更

- `gyazoVideo` オプションを足した。拡張子の無い Gyazo の URL が動画だったときに、`"video"` なら `<video>`、`"embed"` なら Gyazo のプレーヤーで出す。
  既定の `"gif"` は通信せず、今までどおり画像として出す (Gyazo GIF の録画は動く gif になる)。
- 描画される Gyazo の `<img src>` と `metadata.image` が `https://gyazo.com/{hash}/raw` になる (parser と cosense-x の変更)。

動く例は [`examples/astro-blog`](../../examples/astro-blog) にある。

## 設定

```js
// astro.config.mjs
import svelte from "@astrojs/svelte"
import cosense from "@cosense-toolbox/astro"
import { defineConfig } from "astro/config"

export default defineConfig({
  integrations: [
    svelte(),
    cosense({
      components: "./src/components/cosense.ts",
      pageUrl: (page) => `/posts/${encodeURIComponent(page.slug)}/`,
      tagUrl: (tag) => `/tags/${encodeURIComponent(tag)}/`,
      lint: { unresolvedLinks: "error" },
    }),
  ],
})
```

| オプション            | 内容                                                                                                                                                                                                                                                                                                      |
| :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components`          | すべてのページに渡すコンポーネントを default export するモジュールの、プロジェクトのルートからのパス                                                                                                                                                                                                      |
| `pageUrl`             | リンク先のページの URL。`{ id, title, slug }` を受け取る。`id` はプロジェクトのルートからのパスで、サイトに無いページ (`unresolvedLinks: 'link'`) では `null`。返した URL をそのまま使う (`base` は付けない)。省いたときは[下を参照](#リンク先)                                                           |
| `tagUrl` `projectUrl` | `compile` の同名のオプションと同じ                                                                                                                                                                                                                                                                        |
| `unresolvedLinks`     | サイトに無いページへのリンクの出し方。`'text'` (既定) はテキスト、`'link'` はタイトルから作った URL へのリンクにする                                                                                                                                                                                      |
| `lint`                | ビルドの前にリンク切れを調べる。`{ unresolvedLinks?, frontmatter? }`。省略すると調べない。[下を参照](#リンク切れを調べる)                                                                                                                                                                                 |
| `publicMedia`         | サイトに置いたファイルを `[:/images/a.png]` で画像・動画・音声として読む (parser の `publicMedia`)。パスの前に `base` が付く。`false` で無効。既定は有効                                                                                                                                                  |
| `parseOptions`        | パースの設定。parser の `parse` のオプション (`extensions` など) がそのまま渡る                                                                                                                                                                                                                           |
| `renderOptions`       | 描画の設定。cosense-x の `compile` の `renderOptions` に渡る (`extensions` `handlers` `classNames` `classPrefix` `showPads` `iconImageUrl` `title`)。リンク先と、`handlers` で cosense-x のハンドラを上書きしたときの振る舞いは[下を参照](#描画の設定-renderoptions)。色付けは `syntaxHighlight` で決める |
| `rehypePlugins`       | `compile` の同名のオプションと同じ                                                                                                                                                                                                                                                                        |
| `syntaxHighlight`     | コードブロックの色付け。既定の `'astro'` は `markdown.shikiConfig` に従う。`false` で無効、関数で自前の色付け。[下を参照](#コードブロックの色付け)                                                                                                                                                        |
| `assets`              | Cosense 上の画像とファイルを、ビルド時に取ってきてサイトの中に置く。`{ pat?, origin?, links? }`、または `false` で無効。既定は有効                                                                                                                                                                        |
| `gyazoVideo`          | 拡張子の無い Gyazo の URL が動画だったときの出し方。既定の `'gif'` は通信せず `/raw` の画像 (録画は動く gif)。`'video'` / `'embed'` はビルド時に oEmbed で聞き、動画なら `<video>` / Gyazo のプレーヤーの埋め込みにする                                                                                   |

## リンク先

`[ページ名]` と `#タグ` のリンク先は、`pageUrl` を渡さなければ次のようになる。サイトに `base` があれば、その下を指す。

| リンク先のページ                                   | URL                                                                                 |
| :------------------------------------------------- | :---------------------------------------------------------------------------------- |
| `src/pages/a/b.csnx`                               | `{base}/a/b/`                                                                       |
| `src/pages/a/index.csnx`                           | `{base}/a/`                                                                         |
| `src/pages/index.csnx`                             | `{base}/`                                                                           |
| `src/pages` の外のページ (content collection など) | `{base}/{slug}`。`slug` は frontmatter の `slug`、無ければ 1 行目のタイトルから作る |

- `src/pages` のページは、Astro がそのファイルを配信する URL にする。`src/pages` は正しくは `srcDir` の下の `pages`
- URL の末尾の `/` は、Astro がビルドしたページの一覧 (sitemap などが使う) と同じ規則で、`trailingSlash` と `build.format` から決める。
  `trailingSlash: 'always'` なら付け、`'never'` なら付けない。`'ignore'` (既定) なら、`build.format` が `'directory'` (既定) のときだけ付ける
- `src/pages` の外のページの URL は、ルーティングを書いた利用者にしか分からない。content collection の記事を `/posts/{slug}/` などで出すなら、`pageUrl` を渡す

`pageUrl` を渡すと、すべてのページへのリンクがその URL になる。返した URL をそのまま使うので、`base` は自分で付ける。

## 描画の設定 (`renderOptions`)

`renderOptions` は cosense-x の `compile` に渡る。parser の `toHast` のオプションがそのまま渡るのではない。

- リンク先は parser の `pageUrl` ではなく、この統合の `pageUrl` / `tagUrl` / `projectUrl` / `unresolvedLinks` で決まる。
  `handlers` の中の `ctx.options.pageUrl(title, node)` も、そうして決めた URL を返す (テキストにするリンクでは空文字)
- cosense-x は、`page` / `line` / `internalLink` / `projectLink` / `hashtag` / `icon` (`title: false` なら `title` も) のハンドラを差し替えて、リンクの解決とコンポーネントを足している。
  `handlers` で同じノード型を渡すと、そちらが勝つ。詳しくは [cosense-x の README](../cosense-x#描画の設定-renderoptions)

## リンク切れを調べる

`lint` を渡すと、ビルドの前と、開発サーバーの起動時・ページを変えたときに、`srcDir` の下の `.csn` / `.csnx` を読み、サイトに無いページへの `[リンク]` を調べる。開発中は `'error'` でも止めず、ログに出すだけにする。
判定はエディタの診断 ([`@cosense-toolbox/lsp`](../lsp)) と `csn-lsp check` と同じ関数で、パースにはこの統合の
`parseOptions` を使う。エディタで警告されるものと、ビルドで止まるものが一致する。

| `lint` のオプション | 内容                                                                                                             | 既定        |
| :------------------ | :--------------------------------------------------------------------------------------------------------------- | :---------- |
| `unresolvedLinks`   | `'off'` / `'hint'` / `'information'` / `'warning'` / `'error'`。`'error'` ならビルドを止め、それ以外はログに出す | `'warning'` |
| `frontmatter`       | 1 行目の `---` を frontmatter (YAML) として飛ばすか                                                              | `true`      |

ページの題名はファイルの 1 行目で、大文字小文字と、空白と `_` の違いは無視して比べる。`#タグ` と
`[/別プロジェクト/ページ]` は調べない。

## サイトに置いたファイル

`public/` に置いた画像・動画・音声は、`[:/…]` とサイトの根元からのパスで書く。種類は拡張子で決まる。

```
[:/images/screenshot.png]
[[:/images/hero.png]]
[:/movies/demo.mp4]
[:/audio/bgm.mp3]
```

`base: "/docs"` のサイトなら、`[:/images/a.png]` は `/docs/images/a.png` を指す。
メディアでないファイル (`[:/files/a.pdf]`) は、そのファイルへのリンクになる。
Cosense Web では `[:/images/a.png]` もページへのリンクなので、Cosense から持ってきたページの読み方は変わらない。

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
  assets: { pat: process.env.COSENSE_PAT, links: "download" },
})
```

`toHtml` などで自分で描画するページは、`virtual:cosense-x/assets` の `localizeCosenseAssets` に HTML を通す。
ページの取得とアイコンの URL には [`@cosense-toolbox/api`](../api) を使う (`npm install @cosense-toolbox/api`)。

```astro
---
import { cosenseIconUrl, createCosenseApi } from "@cosense-toolbox/api"
import { parse } from "@cosense-toolbox/parser"
import { toHtml } from "@cosense-toolbox/parser/html"
import { localizeCosenseAssets } from "virtual:cosense-x/assets"

const project = "help-jp"
const text = await createCosenseApi().project(project).getPageText("ブラケティング")
if (text === null) throw new Error("ページが無い")
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
  markdown: { shikiConfig: { theme: "github-light" } },
  integrations: [cosense()],
})
```

- 言語はファイル名の拡張子から決める。`code:hello.js` なら `js`、`code:python` なら `python`
- shiki が知らない言語と `excludeLangs` の言語は、色付けせずに出す
- `theme` / `themes` / `defaultColor` / `langs` / `langAlias` / `transformers` を使う。`wrap` は使わない。長い行は `@cosense-toolbox/style` が折り返す
- `markdown.syntaxHighlight` が `'prism'` のときは色付けしない (相当するものが無い)

`syntaxHighlight: false` で色付けをやめる。関数を渡すと、shiki の代わりにそれで色付けする。形は `compile` の `renderOptions.highlight` と同じ。

```js
cosense({
  syntaxHighlight: (code, language) => myHighlighter(code, language), // hast か null を返す
})
```

`toHtml` で自分で描画するページは、`toHtml` の `highlight` に shiki を直接渡す。
テーマなどの設定を 1 つのファイルにまとめ、`astro.config.mjs` とページの両方から読むと、`.md` / `.csn` と見た目が揃う。

```ts
// src/shiki.ts
import type { HastHighlighter } from "@cosense-toolbox/parser/html"
import type { ShikiConfig } from "astro"
import { createHighlighter } from "shiki"

export const shikiConfig = { theme: "github-light" } satisfies Partial<ShikiConfig>

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
import { shikiConfig } from "./src/shiki.ts"

export default defineConfig({
  markdown: { shikiConfig },
  integrations: [cosense()],
})
```

```astro
---
import { parse } from "@cosense-toolbox/parser"
import { toHtml } from "@cosense-toolbox/parser/html"
import { createCodeHighlight } from "../shiki"

const highlight = await createCodeHighlight(["js", "ts"])
const html = toHtml(parse(text), { highlight })
---

<article class="cosense" set:html={html} />
```

### 行番号

`@cosense-toolbox/parser/html` の `codeLineNumbers()` を描画の拡張 (`renderOptions.extensions`) に渡すと、コードブロックの本体行に行番号 (`data-line`) が付く。
番号の表示は `@cosense-toolbox/style` と `@cosense-toolbox/tailwind` が持っていて、行の左の余白に出す。本文の位置は変わらず、コピーしたときに番号は入らない。

```js
// astro.config.mjs
import { codeLineNumbers } from "@cosense-toolbox/parser/html"

cosense({ renderOptions: { extensions: [codeLineNumbers()] } })
```

`toHtml` で描画するページは、`toHtml(page, { extensions: [codeLineNumbers()] })` のように渡す。

- 番号の色は `--cosense-line-number` で変えられる
- エディタと同じく、本文の左に番号の欄を取る。欄の幅はブロックの最後の番号の桁数で決まり、同じブロックの行はそろう
- shiki で色付けしたブロックも、色付けしないブロックと同じく 1 行ずつの要素になるので番号が付く
- 行をまたぐ出力を返すハイライタ (highlight.js など) でひと塊になったブロックには付かない

### テーブルのセル

セルの中は Cosense Web と同じく、リンクの記法だけを読む。行と同じく記法を読みたいときはパースの拡張 `tableCellNotation()` を、セルの中の `\n` のような文字の並びを改行にしたいときは描画の拡張 `tableCellLineBreaks()` を渡す。

```js
// astro.config.mjs
import { tableCellLineBreaks } from "@cosense-toolbox/parser/html"
import { tableCellNotation } from "@cosense-toolbox/parser/extensions"

cosense({
  parseOptions: { extensions: [tableCellNotation()] },
  renderOptions: { extensions: [tableCellLineBreaks("\\n")] },
})
```

## content collection

```ts
// src/content.config.ts
import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{csn,csnx}", base: "./src/content/posts" }),
})

export const collections = { posts }
```

`data` には frontmatter に加えて `title` / `slug` / `description` / `image` / `tags` / `draft` が入る。
Cosense では 1 行目がタイトルなので、frontmatter に書かなくても `title` がある。
`slug` が entry の id になる。

```astro
---
import { render } from "astro:content"
const { Content } = await render(post)
---

<Content />
```

## ページ

`src/pages` に `.csn` / `.csnx` を置くと、そのままページになる。
ほかのページからの `[リンク]` は、`pageUrl` を渡さなければそのページの URL を指す ([リンク先](#リンク先))。
frontmatter の `layout` にレイアウトの `.astro` を指定すると、本文をその default のスロットに入れる。
レイアウトには `file` (ページのファイルの絶対パス) と `frontmatter` と `metadata` が props で渡る。

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
import graph from "virtual:cosense-x/graph"
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
import Counter from "./Counter.svelte"
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
