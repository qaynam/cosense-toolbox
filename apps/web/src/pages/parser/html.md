---
layout: ../../layouts/Doc.astro
title: HTML への変換
description: toHtml の出力と、pageUrl / iconImageUrl / highlight / classNames / showPads / handlers / style
---

# HTML への変換

前のページでは AST から必要な部分を取り出しました。
このページでは、AST をまるごと HTML 文字列にします。

```ts
toHtml(node: AnyNode, options?: HtmlOptions): string
```

`@cosense-toolbox/parser/compile` から import します。
引数はページ全体でなくてもよく、`parseLine` が返した 1 行でも、AST の任意のノードでも受け取ります。

```ts
import { parse } from '@cosense-toolbox/parser'
import { toHtml } from '@cosense-toolbox/parser/compile'

const page = parse('タイトル\nこれは [リンク] です')

toHtml(page)
```

```html
<div class="page">
  <h1 class="title">タイトル</h1>
  <div class="line">
    これは <a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a> です
  </div>
</div>
```

以降の HTML は読みやすさのために字下げして示しますが、実際の出力に要素間の空白は入りません。
オプションの例では、上で作った `page` をそのまま使います。

既定の見た目は [`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) が別パッケージとして持っています。

## オプション

| オプション | 型 | 既定 |
| :--- | :--- | :--- |
| [`pageUrl`](#pageurl) | `(title, node) => string` | `/{title}` |
| [`iconImageUrl`](#iconimageurl) | `(node) => string \| null` | 常に `null` |
| [`highlight`](#highlight) | `(code, language) => string` | 色付けしない |
| [`classNames`](#classnames) | `HtmlClassNames` | `defaultClassNames` |
| [`showPads`](#showpads) | `boolean` | `false` |
| [`handlers`](#handlers) | `NodeHandlers<string>` | 既定のハンドラ |
| [`style`](#style) | `string` | `<style>` を出さない |

上の 3 つは、AST から導けない情報を外から渡すためにあります。
ページをどの URL で配信しているか、アイコン画像がどこにあるか、コードの構文がどう色分けされるかは、どれもソースに書かれていないからです。
残りの 4 つは出力の見た目と構造を調整します。

### pageUrl

```ts
pageUrl?: (title: string, node: PageRefNode) => string
```

ページを指す記法の遷移先を決めます。
対象は `[title]` と `[/proj/page]` と `#tag` と `[user.icon]` の 4 つです。

```ts
toHtml(page, { pageUrl: (title) => `/wiki/${encodeURIComponent(title)}` })
```

`title` には記法に書かれたタイトルがそのまま渡ります。
`[title]` なら `title`、`[/proj/page]` なら `/proj/page`、`#tag` なら `tag`、`[user.icon]` なら `user` です。
どの記法でも同じ形で渡るので、ノード型で分岐する必要はありません。

既定は `/{title}` で、区切りを含むタイトルは区切りを残して各段を encode します。
`defaultPageUrl` として export しているので、独自のハンドラからも呼べます。

外部リンクには効きません。
記法そのものが URL なので、解決するものがないからです。
アイコンについてはリンク先だけを決め、画像は次の `iconImageUrl` が決めます。

### iconImageUrl

```ts
iconImageUrl?: (node: IconNode) => string | null
```

`[user.icon]` の画像 URL を決めます。
`null` を返すと `<img>` を出さず、ユーザー名のテキストリンクになります。

```ts
toHtml(page, {
  iconImageUrl: (node) => `/api/pages/help-jp/${encodeURIComponent(node.user)}/icon`,
})
```

```html
<a class="link icon" href="/rakusai">
  <img class="icon" src="/api/pages/help-jp/rakusai/icon" alt="rakusai" title="rakusai">
</a>
```

既定が `null` なのは、本家の画像 URL がプロジェクト名を含む (`/api/pages/{project}/{user}/icon`) 一方で、記法にプロジェクト名が書かれていないためです。

`[/icons/name.icon]` のように別プロジェクトを指す場合、`node.user` には `/icons/name` が入ります。

> **本家のアイコンは別オリジンから読めません**
>
> `https://scrapbox.io/api/pages/{project}/{user}/icon` は `Cross-Origin-Resource-Policy: same-origin` を返します。
> scrapbox.io 以外のページの `<img>` からは読めず、`Access-Control-Allow-Origin` も無いので `crossorigin` 属性でも回避できません。
> 別オリジンで表示する場合は、自前のサーバーやワーカーで中継してそちらに向けてください。

### highlight

```ts
highlight?: (code: string, language: string) => string
```

コードブロックの中身を色付けします。
シグネチャは markdown-it の同名オプションと同じなので、たいていのハイライタがそのまま嵌ります。

```ts
import hljs from 'highlight.js'

toHtml(page, {
  highlight: (code, language) =>
    hljs.highlight(code, { language: hljs.getLanguage(language) ? language : 'plaintext' }).value,
})
```

ライブラリごとの書きかたは次のとおりです。

```ts
// Prism
highlight: (code, lang) => Prism.highlight(code, Prism.languages[lang] ?? Prism.languages.plain, lang)

// sugar-high
highlight: (code) => sugarHigh(code)

// Shiki は既定で <pre><code> ごと返すので、structure: 'inline' で中身だけにする
const shiki = await createHighlighter({ themes: ['github-light'], langs: ['js'] })
highlight: (code, lang) => shiki.codeToHtml(code, { lang, theme: 'github-light', structure: 'inline' })
```

`language` はファイル名から推測した名前で、拡張子があればそれが、無ければファイル名全体が渡ります。
`code:hello.js` なら `js`、`code:python` なら `python` です。
言語名の綴りはライブラリごとに違うので、必要であれば受け取った側で読み替えてください。

戻り値は HTML としてそのまま埋め込まれるので、エスケープはハイライタの責任になります。

これを渡すと、コードブロックの本体は 1 行 1 要素ではなく 1 つの要素にまとまります。
ハイライタの出力が複数行にまたがるタグを含みうるためで、行で切るとタグが壊れるからです。

ハイライタのテーマ CSS が特定の class を要求する場合は、次の `classNames` で足せます。

```ts
toHtml(page, { highlight, classNames: { codeHighlight: 'highlight hljs' } })
```

### classNames

```ts
classNames?: HtmlClassNames
```

出力する要素に付ける class 名を差し替えます。
指定したキーだけが既定を上書きします。

```ts
toHtml(page, { classNames: { line: 'my-2 leading-7', internalLink: 'text-sky-600 underline' } })
```

値は置き換えであって追加ではありません。
既定の名前を残したまま足す場合は、`'line my-2'` のように自分で並べてください。
空文字を渡すと class 属性そのものを出しません。

既定の一覧は `defaultClassNames` として export しています。

| キー | 対象 |
| :--- | :--- |
| `page` `title` `line` | ページ全体、1 行目、通常の行 |
| `quote` `monospace` | 引用行の `<blockquote>`、等幅行の `<code>` |
| `codeBlock` | コードブロックに属する行 (ヘッダと本体の両方) |
| `codeStart` `codeFilename` `codeBody` `codeHighlight` | ヘッダの `<code>`、ファイル名、本体の `<code>`、色付けした本体に足す class |
| `indentMark` `pad` `dot` | `showPads` のときだけ出る要素 |
| `internalLink` `externalLink` `projectLink` `hashtag` | 各リンク |
| `inlineCode` `image` `icon` `formula` `decoration` `table` | 各インライン記法とテーブル |

### showPads

```ts
showPads?: boolean
```

インデントを本家と同じ要素として書き出します。
深さ 1 段につき `pad` が 1 つ並び、その右端に中点が付きます。

```html
<div class="line" data-indent="2">
  <span class="indent-mark">
    <span class="pad"> </span>
    <span class="pad"> </span>
    <span class="dot"></span>
  </span>
  字下げ
</div>
```

既定では要素を出さず、深さは `data-indent` 属性だけで表します。
中点は CSS の擬似要素で描けるので、見た目はどちらでも変わりません。

### handlers

```ts
handlers?: NodeHandlers<string>
```

ここまでのオプションは既定の出力を調整するものでした。
`handlers` は、ノード型ごとの出力そのものを差し替えます。

既定のハンドラに自動で重ねられるので、変えたい型だけ書けば済みます。

```ts
toHtml(page, {
  handlers: { formula: (node) => katex.renderToString(node.value) },
})
```

ハンドラは `(node, ctx)` を受け取ります。
`ctx.children(node)` で子ノードの変換結果が配列で得られます。

```ts
handlers: {
  line: (node, ctx) => `<p>${ctx.children(node).join('')}</p>`,
}
```

既定の出力を包みたいときは、`createHtmlHandlers(options)` で既定のハンドラ一式を取れます。

拡張が足した独自のノード型も、`InlineNodeMap` を declaration merging で拡張してあればここのキーになります。
ハンドラを書かなかった独自ノードは、子があればその中身が出力されます。

ハンドラは `classNames` の設定を受け取らないので、両方を使う場合の class 名は書いた側で決めることになります。

差し替えると既定のエスケープも無くなるので、[エスケープと URL の検査](#エスケープと-url-の検査)を必ずご確認ください。

### style

```ts
style?: string
```

渡した CSS を `<style>` 要素として出力の先頭に差し込みます。

```ts
import css from '@cosense-toolbox/style/style.css?raw'

toHtml(page, { style: css })
// <style>…</style><div class="page">…</div>
```

iframe の `srcdoc` のように、1 つの文字列で完結させたいときに使います。
CSS そのものはこのパッケージに含まれていません。

## 出力の形

class 名は接頭辞を持たず、すべて [`classNames`](#classnames) で差し替えられます。

### ブロック

| 記法 | HTML |
| :--- | :--- |
| 1 行目 | `<h1 class="title">タイトル</h1>` |
| 通常の行 | `<div class="line">本文</div>` |
| 字下げした行 | `<div class="line" data-indent="2">本文</div>` |
| 空行 | `<div class="line"><br></div>` |
| `> 引用` | `<blockquote class="quote">引用</blockquote>` |
| `$ ls` | `<code class="monospace">$ ls</code>` |

ページ全体は `<div class="page">` で包まれます。
インデントの深さは class ではなく `data-indent` 属性で表します。
中点は要素を持たず、CSS の擬似要素が描きます。
本家と同じ `.indent-mark` と `.pad` と `.dot` の要素が必要な場合は [`showPads`](#showpads) を渡してください。

### テーブル

```html
<table class="table">
  <caption>テーブル名</caption>
  <tbody>
    <tr>
      <td>abc</td>
      <td>def</td>
    </tr>
  </tbody>
</table>
```

### コードブロック

本家と同じく 1 行を 1 要素に切ります。

```html
<div class="line code-block">
  <code class="code-start">
    <span class="code-block-start">a.js</span>
  </code>
</div>
<div class="line code-block" data-indent="1">
  <code class="code-body">const a = 1</code>
</div>
```

本体行はヘッダより 1 段深い `data-indent` を持ちます。
それより深い字下げは中身の文字列に残ります。

[`highlight`](#highlight) を渡した場合だけ、本体が 1 つの `<code class="code-body highlight">` にまとまります。

### インライン

| 記法 | HTML |
| :--- | :--- |
| `[title]` | `<a class="link" href="/title">title</a>` |
| `https://a.test/x` | `<a class="link link-external" href="https://a.test/x">https://a.test/x</a>` |
| `[https://a.test/x label]` | `<a class="link link-external" href="https://a.test/x">label</a>` |
| `[/proj/page]` | `<a class="link link-project" href="/proj/page">/proj/page</a>` |
| `#tag` | `<a class="hashtag" href="/tag">#tag</a>` |
| `` `code` `` | `<code class="code">code</code>` |
| `[a.png]` | `<img class="image" src="a.png" alt="">` |
| `[[a.png]]` | `<img class="image" src="a.png" alt="" data-large="true">` |
| `[user.icon]` | `<a class="link icon" href="/user">user</a>` |
| `[$ x^2]` | `<span class="formula">x^2</span>` |

数式は組版せず、記法を外した中身をそのまま置きます。
KaTeX に渡したい場合は [`handlers`](#handlers) で差し替えてください。

アイコンは既定では画像を出しません。
[`iconImageUrl`](#iconimageurl) を渡すと `<img>` が入ります。

### 装飾

フラグの集合を入れ子の要素に開きます。

```html
<!-- [* 太字] -->
<span class="decoration">
  <strong>太字</strong>
</span>

<!-- [-/ x] は打消しかつ斜体 -->
<span class="decoration">
  <em>
    <s>x</s>
  </em>
</span>

<!-- [*** 見出し] -->
<span class="decoration" data-size-level="2">
  <strong>見出し</strong>
</span>
```

見出しの段階は `data-size-level` 属性で表します。

## エスケープと URL の検査

既定のハンドラは、テキストと属性値をすべてエスケープします。
`javascript:` と `vbscript:` のスキームは href と src の両方から落とし、`data:` は href からだけ落とします。
`data:` 画像には正当な使い道があるためです。

スキームの判定では、先に空白と制御文字を落とします。
ブラウザは途中にタブや改行が挟まった `javascript:` もスキームとして解釈するので、それを潰すためです。

**`handlers` と `highlight` が返した文字列はそのまま埋め込みます。**
そこでのエスケープは書いた人の責任になります。
同じことをするための部品を export しています。

| export | 役割 |
| :--- | :--- |
| `escapeHtml(value)` | `& < > " '` を実体参照にします |
| `safeHref(url)` | href に入れて安全な URL だけを返します。script が動くスキームなら `null` です |
| `safeSrc(url)` | src 版です。`data:` 画像は許します |
| `defaultPageUrl(title)` | `pageUrl` の既定の実装です |
| `defaultClassNames` | 既定の class 名です |

外部リンクを別タブで開く例を示します。

```ts
import { escapeHtml, safeHref, toHtml } from '@cosense-toolbox/parser/compile'

toHtml(page, {
  handlers: {
    externalLink: (node) => {
      const href = safeHref(node.target)
      return `<a class="link link-external" href="${escapeHtml(href ?? '')}" target="_blank" rel="noreferrer">${escapeHtml(node.label)}</a>`
    },
  },
})
```

信頼できないページを表示する場合は、許可する画像 URL の制限も呼び出し側で行ってください。

ここまでが HTML への変換です。
HTML 以外の形式が必要な場合は、次のページに進んでください。
