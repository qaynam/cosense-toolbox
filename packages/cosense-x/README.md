# @cosense-toolbox/cosense-x

Cosense (旧 Scrapbox) の記法で書いたページを、JSX のモジュールにするコンパイラ。
MDX の Cosense 版にあたる。

- 形式は 2 つある。`.csn` は素の Cosense 記法で、Markdown の `.md` にあたる。`.csnx` は `.csn` にコンポーネントの行を足したもので、`.mdx` にあたる
- どちらの形式にも frontmatter を書ける。ファイル先頭の YAML と、Cosense の画面でも書ける `code:frontmatter.yml` ブロックの 2 か所に書ける
- リンク (`[title]` / `[./foo.csn]` / `#tag`) は手元のファイルだけで解決する。Cosense に問い合わせないので、オフラインでもビルドできる
- 逆リンクと 2 hop リンクを計算できる (`./graph`)
- 出力は `jsxImportSource` で切り替えられる。Astro・React・Preact・Vue のどれにも出せる
- 要素の構造と class 名は `@cosense-toolbox/parser` の `toHtml` と同じなので、`@cosense-toolbox/style` がそのまま当たる

> **beta**：公開 API はまだ変わりうる。

Astro で使うなら [`@cosense-toolbox/astro`](../astro-cosense) を入れる。
このパッケージを直接使うのは、ほかのフレームワークに組み込むときや、ビルドの仕組みを自分で書くとき。

## 使ってみる

```ts
import { compile } from '@cosense-toolbox/cosense-x'

const { code, metadata } = await compile(
  `---
date: 2026-09-01
---
はじめての投稿
[Cosense で書く] の使い方 #日記
<Callout type="warn">
閉じタグまでの行が children になる
</Callout>`,
  { format: 'csnx', jsxImportSource: 'react' },
)
```

`code` は次の形の ES モジュールになる。

```js
export const frontmatter = { date: '2026-09-01' }
export const metadata = { title: 'はじめての投稿', slug: 'はじめての投稿', tags: ['日記'], ... }
export default function CosenseContent(props = {}) {
  const _components = { a: 'a', div: 'div', ..., ...props.components }
  return /* JSX */
}
```

要素はすべて `_components` 経由で引く。
そのため `props.components` に渡せば、`<Callout>` のようなコンポーネントも、`a` や `img` のような既定の要素も差し替えられる。

## コンポーネントの行 (`.csnx`)

1 行まるごとが `<Name ... />` の行をコンポーネントの呼び出しにする。
中身を持たせるときは、`<Name ...>` の行と `</Name>` の行で挟む。間の行が children になる。

```
<Counter start={10} />
<Callout type="warn" title="注意">
この行と
 この箇条書きが children になる
</Callout>
ここからは Callout の外
```

- 名前は大文字で始める
- 開始タグと閉じタグを、それぞれ 1 行まるごとで書くと、間の行が children になる。閉じ忘れや、対応しない閉じタグはコンパイルエラーになる (行番号付き)
- 行の途中にも書ける (MDX のインラインの JSX と同じ)。`modalを開く <Modal>[画像]</Modal>` のように、同じ行の中で開始タグと閉じタグを対にする。行の途中の閉じていないタグは、文章中の `Array<T>` などとみなしてテキストのまま出し、警告だけ出す
- インラインコード (`` `<Modal>` ``) やブラケット (`[<Modal>]`) の中のタグは読まない
- children はインデントでは決めない。中の行は、箇条書きも含めて書いたとおりに出る。開始タグの行が字下げされていれば、中の行をそのぶん浅くする
- 属性に書けるのは `"文字列"` と `'文字列'`、`{JSON の値}`、値なし (true) だけ。任意の JS の式は評価しない。共有プロジェクトのページをビルド時に実行させないため
- 書式から外れた行はただのテキスト行になる。`props.components` に無いコンポーネントは、開始タグ・中身・閉じタグの行をそのまま出す
- Cosense の画面では、ただのテキスト行に見える

`.csn` では、これらの行もただのテキストになる。

## frontmatter

```
---
slug: hello
date: 2026-09-01
---
タイトル
code:frontmatter.yml
 draft: true
 tags: [Cosense]
本文
```

- ファイル先頭の YAML と `code:frontmatter.yml` (`.yaml` も可) の両方にあるキーは、ファイル先頭のほうを使う
- `code:frontmatter.yml` はインデントせずに書いたものだけを読み、本文には出さない
- `metadata` の `title` / `slug` / `description` / `image` / `draft` は frontmatter の値で上書きできる。`tags` は frontmatter の `tags` と本文の `#tag` を合わせたものになる

## リンクの解決

| 書き方                              | 解決のしかた                                                                       |
| :---------------------------------- | :--------------------------------------------------------------------------------- |
| `[ページ名]`                        | 索引 (`index`) からタイトルで引く。大文字小文字と、空白と `_` の違いは無視する     |
| `[./foo.csn]` `[../notes/bar.csnx]` | 今のファイル (`filePath`) からの相対パスでファイルを指す。表示はリンク先のタイトル |
| `#タグ`                             | `tagUrl` があればその URL、無ければ `[タグ]` と同じ                                |
| `[/project/page]`                   | `projectUrl`。既定は `https://scrapbox.io/project/page`                            |

```ts
import { compile, createIndex } from '@cosense-toolbox/cosense-x'

const index = createIndex([
  { id: 'posts/a.csn', title: 'Page A', slug: 'page-a' },
  { id: 'posts/b.csn', title: 'Page B', slug: 'page-b', draft: true },
])

await compile(source, {
  index,
  filePath: 'posts/a.csn',
  pageUrl: (page) => `/posts/${page.slug}/`,
  tagUrl: (tag) => `/tags/${tag}/`,
  unresolved: 'warn',
})
```

索引に無いページへのリンクの扱いは `unresolved` で決める。

- **`text`** (既定)：リンクにせずテキストとして出す。非公開ページの名前が URL に漏れない
- **`link`**：索引に無くても、タイトルから作った URL へのリンクにする
- **`warn`**：テキストとして出し、`warnings` に積む
- **`error`**：コンパイルを失敗させる

draft のページは索引に載らないので、そこへのリンクも「索引に無いページ」になる。
`index` を渡さなければ、`[ページ名]` はすべて存在するページとみなしてリンクにする。

## リンクグラフ (`./graph`)

```ts
import { scanPages } from '@cosense-toolbox/cosense-x/graph'

const graph = scanPages([
  { id: 'posts/react.csn', source: 'React\n[JavaScript] のライブラリ #フロントエンド' },
  { id: 'posts/vue.csn', source: 'Vue\n[JavaScript] で書く #フロントエンド' },
  { id: 'posts/js.csn', source: 'JavaScript\n言語' },
])

graph.backlinks['posts/js.csn'] // → ['posts/react.csn', 'posts/vue.csn']
graph.twoHop['posts/react.csn']
// → [{ via: 'JavaScript', viaId: 'posts/js.csn', pages: ['posts/vue.csn'] },
//    { via: 'フロントエンド', viaId: null, pages: ['posts/vue.csn'] }]
```

- Cosense と同じく、タグもリンクとして扱う。2 hop はタグや、まだ無いページを経由してもつながる
- 2 hop には、直接リンクしているページと逆リンクのページを重ねて出さない
- draft のページはグラフに入らない
- 結果はただのオブジェクトなので、JSON にして持ち回れる
- このサブパスは JS の生成 (unified 系) を import しない。一覧ページやサイトマップを作るだけなら、これだけで済む

## Cosense からの取得 (`./fetch`)

ページを 1 枚取ってくる。非公開プロジェクトは `pat` に Personal Access Token を渡す。

```ts
import { fetchPage, fetchPageText } from '@cosense-toolbox/cosense-x/fetch'

const text = await fetchPageText('help-jp', 'ブラケティング') // 本文そのまま
const page = await fetchPage('help-jp', 'ブラケティング') // { title, text, created, updated }
const secret = await fetchPageText('my-private', 'メモ', { pat: process.env.COSENSE_PAT })
```

Cosense 上の画像やファイル (`https://scrapbox.io/files/…` とアイコン) も取ってこられる。

```ts
import { cosenseIconUrl, fetchAsset, isCosenseAssetUrl } from '@cosense-toolbox/cosense-x/fetch'

cosenseIconUrl('help-jp', 'cosense') // → https://scrapbox.io/api/pages/help-jp/cosense/icon
isCosenseAssetUrl('https://scrapbox.io/files/xxx.png') // → true
const { data, contentType } = await fetchAsset('https://scrapbox.io/files/xxx.png', { pat })
```

- これらのファイルは `Cross-Origin-Resource-Policy: same-origin` を返すので、別のサイトの `<img>` からは読めない
- リダイレクト先の URL は期限付き (`/files/` は 5 分) なので、解決した URL を埋め込んでもすぐ表示されなくなる
- そのため静的なサイトでは、中身を取ってきてサイトの中に置く。Astro 統合はこれを自動で行う
- `fetchAsset` はリダイレクトを自分で辿り、PAT は Cosense への要求にだけ付ける。リダイレクト先の Google Cloud Storage や Gyazo には送らない

## API

| モジュール                         | API                                                                                                                                                                                                                 |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@cosense-toolbox/cosense-x`       | `compile` `toHast` `readPage` `createIndex` `createLinkResolver` `parseComponentTag` `parseClosingTag` `findInlineComponents` `splitFrontmatter` `readFrontmatter` `collectMetadata` `normalizeTitle` `titleToSlug` |
| `@cosense-toolbox/cosense-x/graph` | `scanPages` `buildGraph` `readPage` `createIndex` `normalizeTitle` `titleToSlug`                                                                                                                                    |
| `@cosense-toolbox/cosense-x/fetch` | `fetchPage` `fetchPageText` `fetchAsset` `isCosenseAssetUrl` `cosenseIconUrl`                                                                                                                                       |

`compile` の主なオプション:

| オプション                                                      | 内容                                                                                                                                                                                           |
| :-------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`                                                        | `'csn'` か `'csnx'`。省くと `filePath` の拡張子で決める                                                                                                                                        |
| `jsxImportSource`                                               | JSX ランタイムの読み込み元。既定は `'react'`                                                                                                                                                   |
| `elementAttributeNameCase`                                      | `'react'` なら `className`、`'html'` なら `class`。既定は `jsxImportSource` から決める                                                                                                         |
| `rehypePlugins`                                                 | hast に当てる rehype プラグイン                                                                                                                                                                |
| `index` `filePath` `pageUrl` `tagUrl` `projectUrl` `unresolved` | リンクの解決                                                                                                                                                                                   |
| `renderOptions`                                                 | 描画の設定。parser の `toHast` のオプションがそのまま渡る (`extensions` `handlers` `highlight` `classNames` `showPads` `iconImageUrl`)。加えて `title: false` でタイトル行 (`<h1>`) を出さない |
| `parseOptions`                                                  | パーサーに渡すオプション (記法の拡張など)                                                                                                                                                      |

### コードブロックの色付け

`renderOptions.highlight` は parser の `toHast` の同名のオプションと同じで、HTML の文字列ではなく hast を返す。
shiki の `codeToHast` の結果はそのまま返してよい。`pre > code` の形なら、code の中身を使い、pre の class とテーマの背景色・文字色 (`--cosense-code-bg` / `--cosense-code-text` の変数にして) をコードブロックに移す。行ごとの `span.line` は 1 行ずつの要素に入れ直す。

```ts
import { compile } from '@cosense-toolbox/cosense-x'
import { createHighlighter } from 'shiki'

const shiki = await createHighlighter({ themes: ['github-light'], langs: ['js', 'ts'] })

await compile(source, {
  renderOptions: {
    // 読み込んでいない言語は null を返して、色付けせずに出す
    highlight: (code, language) =>
      shiki.getLoadedLanguages().includes(language)
        ? shiki.codeToHast(code, { lang: language, theme: 'github-light' })
        : null,
  },
})
```

- `language` はファイル名から推測した名前。`code:hello.js` なら `js`、`code:python` なら `python`。`@cosense-toolbox/parser/html` の `codeLanguageOf` と同じ
- 行をまたぐ出力 (highlight.js など) は、本体を 1 つの要素にまとめる。行で切ると要素が壊れるため
- 例外を投げたブロックは、色付けせずに出す
- 行番号は `renderOptions: { extensions: [codeLineNumbers()] }` で付ける (`@cosense-toolbox/parser/html`)
- `null` を返すと、色付けせず 1 行ずつのまま出す
- `highlight` は同期で呼ぶ。shiki のように言語を非同期で読み込むものは、先に読み込んでおく
- `pre > code` を探して剥がすので、rehype のハイライタ (`@shikijs/rehype` など) はそのままでは当たらない。`highlight` を使う

## 仕組み

```
.csn / .csnx
  │ frontmatter を分ける
  │ @cosense-toolbox/parser で AST にする
  ▼
Cosense AST
  │ toHast (parser の toHast に、リンクの解決と .csnx のコンポーネントを足したもの)
  ▼
hast ── rehype プラグイン
  │ hast-util-to-estree → estree-util-build-jsx → estree-util-to-js
  ▼
ES モジュール
```

hast から先は、MDX と同じ公開パッケージを使っている。

## ライセンス

MIT。

このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装である。
開発元である Helpfeel 社とは関係がなく、公認も受けていない。
