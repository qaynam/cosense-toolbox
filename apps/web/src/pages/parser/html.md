---
layout: ../../layouts/Doc.astro
title: HTML への変換
description: toHast / toHtml の出力と、pageUrl / iconImageUrl / highlight / classNames / showPads / handlers / extensions / style
---

# HTML への変換

前のページでは AST から必要な部分を取り出しました。
このページでは、AST をまるごと HTML 文字列にします。

```ts
toHtml(node: AnyNode, options?: HtmlOptions): string
```

`@cosense-toolbox/parser/html` から import します。
引数はページ全体でなくてもよく、`parseLine` が返した 1 行でも、AST の任意のノードでも受け取ります。

```ts
import { parse } from '@cosense-toolbox/parser'
import { toHtml } from '@cosense-toolbox/parser/html'

const page = parse('タイトル\nこれは [リンク] です')

toHtml(page)
```

```html
<div class="page">
  <h1 class="title">タイトル</h1>
  <div class="line">これは <a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a> です</div>
</div>
```

`toHtml` は、AST を hast (HTML の AST) にする `toHast` の出力を、[hast-util-to-html](https://github.com/syntax-tree/hast-util-to-html) で文字列にしているだけです。
描画の規則は `toHast` にだけあるので、HTML の文字列が要らないとき (rehype のプラグインに通す、JSX にする) は `toHast` を使います。
オプションは `style` を除いて同じです。

```ts
import { toHast } from '@cosense-toolbox/parser/html'

toHast(page) // { type: 'root', children: [{ type: 'element', tagName: 'div', ... }] }
```

以降の HTML は読みやすさのために字下げして示しますが、実際の出力に要素間の空白は入りません。
オプションの例では、上で作った `page` をそのまま使います。

既定の見た目は [`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/tree/main/packages/style) が別パッケージとして持っています。

## オプション

| オプション                      | 型                                           | 既定                 |
| :------------------------------ | :------------------------------------------- | :------------------- |
| [`pageUrl`](#pageurl)           | `(title, node) => string`                    | `/{title}`           |
| [`iconImageUrl`](#iconimageurl) | `(node) => string \| null`                   | 常に `null`          |
| [`highlight`](#highlight)       | `(code, language) => string \| hast \| null` | 色付けしない         |
| [`classNames`](#classnames)     | `HtmlClassNames`                             | `defaultClassNames`  |
| [`showPads`](#showpads)         | `boolean`                                    | `false`              |
| [`handlers`](#handlers)         | `HastHandlers`                               | 既定のハンドラ       |
| [`extensions`](#extensions)     | `RenderExtension[]`                          | なし                 |
| [`style`](#style)               | `string`                                     | `<style>` を出さない |

上の 3 つは、AST から導けない情報を外から渡すためにあります。
ページをどの URL で配信しているか、アイコン画像がどこにあるか、コードの構文がどう色分けされるかは、どれもソースに書かれていないからです。
残りの 5 つは出力の見た目と構造を調整します。

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
<a class="link icon" href="/cosense">
  <img class="icon" src="/api/pages/help-jp/rakusai/icon" alt="rakusai" title="rakusai" />
</a>
```

既定が `null` なのは、Cosense Web の画像 URL がプロジェクト名を含む (`/api/pages/{project}/{user}/icon`) 一方で、記法にプロジェクト名が書かれていないためです。

`[/icons/name.icon]` のように別プロジェクトを指す場合、`node.user` には `/icons/name` が入ります。

> **Cosense Web のアイコンは別オリジンから読めません**
>
> `https://scrapbox.io/api/pages/{project}/{user}/icon` は `Cross-Origin-Resource-Policy: same-origin` を返します。
> scrapbox.io 以外のページの `<img>` からは読めず、`Access-Control-Allow-Origin` も無いので `crossorigin` 属性でも回避できません。
> 別オリジンで表示する場合は、自前のサーバーやワーカーで中継してそちらに向けてください。

### highlight

```ts
highlight?: (code: string, language: string) => string | Root | ElementContent[] | null
```

コードブロックの中身を色付けします。
HTML の文字列を返す形は markdown-it の同名オプションと同じなので、たいていのハイライタがそのまま嵌ります。
文字列はそのまま埋め込まれます。hast を返すこともでき、`null` を返すとそのブロックは色付けしません。
`toHast` の `highlight` は hast か `null` だけを受け取ります。
`language` はファイル名から推測した名前で、`code:hello.js` なら `js`、`code:python` なら `python` です。
同じ決めかたの関数を `codeLanguageOf` として `@cosense-toolbox/parser/html` から出しています。

```ts
import hljs from 'highlight.js'

toHtml(page, {
  highlight: (code, language) =>
    hljs.highlight(code, {
      language: hljs.getLanguage(language) ? language : 'plaintext',
    }).value,
})
```

ライブラリごとの書きかたは次のとおりです。

```ts
// Prism
highlight: (code, lang) =>
  Prism.highlight(code, Prism.languages[lang] ?? Prism.languages.plain, lang)

// sugar-high
highlight: (code) => sugarHigh(code)

// Shiki は hast をそのまま返せる。<pre><code> は剥がし、テーマの class と色はコードブロックに移る
const shiki = await createHighlighter({
  themes: ['github-light'],
  langs: ['js'],
})
highlight: (code, lang) =>
  shiki.getLoadedLanguages().includes(lang)
    ? shiki.codeToHast(code, { lang, theme: 'github-light' })
    : null
```

`language` はファイル名から推測した名前で、拡張子があればそれが、無ければファイル名全体が渡ります。
`code:hello.js` なら `js`、`code:python` なら `python` です。
言語名の綴りはライブラリごとに違うので、必要であれば受け取った側で読み替えてください。

文字列の戻り値は HTML としてそのまま埋め込まれるので、エスケープはハイライタの責任になります。
例外を投げたブロックは、色付けせずに出します。

出力が Shiki のように行ごとの要素 (`span.line`) に分かれていれば、色付けしないときと同じく 1 行ずつの要素に入れ直します。
行をまたぐ出力 (highlight.js など) は、行で切るとタグが壊れるので、本体を 1 つの要素にまとめます。

Shiki のテーマの背景色と文字色は、`style` のまま移さず、`--cosense-code-bg` と `--cosense-code-text` の変数にして渡します。
`@cosense-toolbox/style` はこの変数でコードブロックを塗るので、テーマの色が出たうえで、普通の CSS で上書きもできます。

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
toHtml(page, {
  classNames: {
    line: 'my-2 leading-7',
    internalLink: 'text-sky-600 underline',
  },
})
```

値は置き換えであって追加ではありません。
既定の名前を残したまま足す場合は、`'line my-2'` のように自分で並べてください。
空文字を渡すと class 属性そのものを出しません。

既定の一覧は `defaultClassNames` として export しています。

| キー                                                       | 対象                                                                       |
| :--------------------------------------------------------- | :------------------------------------------------------------------------- |
| `page` `title` `line`                                      | ページ全体、1 行目、通常の行                                               |
| `quote` `monospace`                                        | 引用行の `<blockquote>`、等幅行の `<code>`                                 |
| `codeBlock`                                                | コードブロックに属する行 (ヘッダと本体の両方)                              |
| `codeStart` `codeFilename` `codeBody` `codeHighlight`      | ヘッダの `<code>`、ファイル名、本体の `<code>`、色付けした本体に足す class |
| `indentMark` `pad` `dot`                                   | `showPads` のときだけ出る要素                                              |
| `internalLink` `externalLink` `projectLink` `hashtag`      | 各リンク                                                                   |
| `inlineCode` `image` `icon` `formula` `decoration` `table` | 各インライン記法とテーブル                                                 |

### showPads

```ts
showPads?: boolean
```

インデントをCosense Web と同じ要素として書き出します。
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
handlers?: HastHandlers
```

ここまでのオプションは既定の出力を調整するものでした。
`handlers` は、ノード型ごとの出力そのものを差し替えます。
ハンドラは hast のノード (1 つか配列) を返します。

既定のハンドラに自動で重ねられるので、変えたい型だけ書けば済みます。

```ts
toHtml(page, {
  handlers: {
    line: (node, ctx) => ({
      type: 'element',
      tagName: 'p',
      properties: {},
      children: ctx.children(node),
    }),
  },
})
```

ハンドラは `(node, ctx)` を受け取ります。

| `ctx`                | 内容                                                           |
| :------------------- | :------------------------------------------------------------- |
| `ctx.children(node)` | 子ノードの変換結果を、平らな配列で返します                     |
| `ctx.node(node)`     | ノード 1 つを変換します                                        |
| `ctx.options`        | 既定値を埋めたオプション (`pageUrl` や `classNames` など) です |
| `ctx.ancestors`      | 今描いているノードの祖先です。根から親までの順に並びます       |

HTML の文字列をそのまま入れたいときは、`raw` ノードを返します。
`toHtml` はこれをエスケープせずに埋め込みます。

```ts
handlers: {
  formula: (node) => ({ type: "raw", value: katex.renderToString(node.value) }),
}
```

既定の出力を包んだり、属性を足したりするだけなら、`handlers` で作り直さずに次の [`extensions`](#extensions) を使います。

拡張が足した独自のノード型も、`InlineNodeMap` を declaration merging で拡張してあればここのキーになります。
ハンドラを書かなかった独自ノードは、子があればその中身が出力されます。

`classNames` の設定は `ctx.options.classNames` から読めます。

差し替えたハンドラでは既定の URL の検査が効かないので、[エスケープと URL の検査](#エスケープと-url-の検査)を必ずご確認ください。

### extensions

```ts
extensions?: RenderExtension[]
```

`handlers` が出力を**作る**のに対して、`extensions` はできた出力に**手を加えます**。
拡張はノード型ごとの関数を持ち、その型のここまでの出力を受け取って、新しい出力を返します。
vite の `transform` と同じく、前の段の出力をもらって加工するだけの関数です。

```ts
toHtml(page, {
  extensions: [
    {
      // 画像を <figure> で包む。output は既定 (または handlers) の出力
      image: (output) => ({ type: 'element', tagName: 'figure', properties: {}, children: output }),
    },
  ],
})
```

関数は `(output, node, ctx)` を受け取るので、AST のノードやオプションを見て加工できます。

1 つのノードは次の順で描かれます。

1. 既定のハンドラ (`handlers` にその型があれば、そちらで置き換え)
2. `extensions` を並べた順に通す。前の拡張の出力が次の拡張に渡る

同じノード型に触る拡張どうしも、並べるだけで重なります。
拡張が例外を投げたときは握りつぶさずにそのまま上がるので、書き間違いに気づけます。

用意している拡張は次のとおりです。

| 拡張                          | 内容                                                                                                                                  |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `codeLineNumbers()`           | コードブロックの本体行に行番号 (`data-line`) と桁数 (`data-line-digits`) を付けます。番号の表示は `@cosense-toolbox/style` が持ちます |
| `tableCellLineBreaks(marker)` | テーブルのセルの中の `marker` を `<br>` にします                                                                                      |

#### tableCellLineBreaks

Cosense のセルには改行を書けないので、`\n` のような文字の並びを代わりに書いておき、描画のときに改行にします。

```ts
import { tableCellLineBreaks, toHtml } from '@cosense-toolbox/parser/html'

toHtml(parse('t\ntable:x\n 1 行目\\n2 行目'), {
  extensions: [tableCellLineBreaks('\\n')],
})
// → … <td>1 行目<br>2 行目</td> …
```

`marker` は文字列そのままで探します。正規表現としては読みません。
当てるのはセルの中の地の文 (AST の `text` ノード) だけです。
コード・数式・リンクの表示は `text` ノードではないので、その中には当てません (数式の `\nu` などを壊さないため)。
`classNames` や `handlers` で出力を変えても同じです。装飾の中身は `text` ノードなので当てます。

どのノードの中にあるかは `ctx.ancestors` で見ています。自分で書く拡張でも、同じように場所で出力を変えられます。

```ts
// 引用の中の画像だけを <figure> で包む
{
  image: (output, _node, ctx) =>
    ctx.ancestors.some((node) => node.type === "line" && node.quote)
      ? { type: "element", tagName: "figure", properties: {}, children: output }
      : output,
}
```

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

| 記法         | HTML                                           |
| :----------- | :--------------------------------------------- |
| 1 行目       | `<h1 class="title">タイトル</h1>`              |
| 通常の行     | `<div class="line">本文</div>`                 |
| 字下げした行 | `<div class="line" data-indent="2">本文</div>` |
| 空行         | `<div class="line"><br></div>`                 |
| `> 引用`     | `<blockquote class="quote">引用</blockquote>`  |
| `$ ls`       | `<code class="monospace">$ ls</code>`          |

ページ全体は `<div class="page">` で包まれます。
インデントの深さは class ではなく `data-indent` 属性で表します。
中点は要素を持たず、CSS の擬似要素が描きます。
Cosense Web と同じ `.indent-mark` と `.pad` と `.dot` の要素が必要な場合は [`showPads`](#showpads) を渡してください。

### テーブル

```html
<table class="table">
  <caption>
    テーブル名
  </caption>
  <tbody>
    <tr>
      <td>abc</td>
      <td>def</td>
    </tr>
  </tbody>
</table>
```

セルの中のリンクの記法は、行と同じく `<a>` になります。
ほかの記法は、既定では書いたままの文字です ([`tableCellNotation`](/parser/extend/#テーブルのセルの中で記法を読む) で変えられます)。

### コードブロック

Cosense Web と同じく 1 行を 1 要素に切ります。

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

[`highlight`](#highlight) を渡し、その出力が行ごとに分かれていないときだけ、本体が 1 つの `<code class="code-body highlight">` にまとまります。

行番号が要るときは、[`extensions`](#extensions) に `codeLineNumbers()` を渡します。
本体行に 1 から数えた `data-line` と、番号の桁数の `data-line-digits` が付きます。
`@cosense-toolbox/style` はそれを見て、行の左に番号の欄を取って番号を出します。

```ts
import { codeLineNumbers, toHtml } from '@cosense-toolbox/parser/html'

toHtml(page, { extensions: [codeLineNumbers()] })
// <div class="line code-block" data-indent="1" data-line="1" data-line-digits="1">…</div>
```

ほかの拡張とは、配列に並べるだけで重なります。

### インライン

| 記法                       | HTML                                                                         |
| :------------------------- | :--------------------------------------------------------------------------- |
| `[title]`                  | `<a class="link" href="/title">title</a>`                                    |
| `https://a.test/x`         | `<a class="link link-external" href="https://a.test/x">https://a.test/x</a>` |
| `[https://a.test/x label]` | `<a class="link link-external" href="https://a.test/x">label</a>`            |
| `[/proj/page]`             | `<a class="link link-project" href="/proj/page">/proj/page</a>`              |
| `#tag`                     | `<a class="hashtag" href="/tag">#tag</a>`                                    |
| `` `code` ``               | `<code class="code">code</code>`                                             |
| `[a.png]`                  | `<img class="image" src="a.png" alt="">`                                     |
| `[[a.png]]`                | `<img class="image" src="a.png" alt="" data-large="true">`                   |
| `[user.icon]`              | `<a class="link icon" href="/user">user</a>`                                 |
| `[$ x^2]`                  | `<span class="formula">x^2</span>`                                           |

数式は組版せず、記法を外した中身をそのまま置きます。
KaTeX に渡したい場合は [`handlers`](#handlers) で差し替えてください。

アイコンは既定では画像を出しません。
[`iconImageUrl`](#iconimageurl) を渡すと `<img>` が入ります。

### 装飾

フラグの集合を入れ子の要素に開きます。

書かれた記号は `deco-` を付けた class になります。
`classNames.decoration` とは別に、常に付きます。

```html
<!-- [* 太字] -->
<span class="decoration deco-*">
  <strong>太字</strong>
</span>

<!-- [-/ x] は打消しかつ斜体 -->
<span class="decoration deco-- deco-/">
  <em>
    <s>x</s>
  </em>
</span>

<!-- [*** 見出し] -->
<span class="decoration deco-*" data-size-level="2">
  <strong>見出し</strong>
</span>
```

見出しの段階は `data-size-level` 属性で表します。

`.` や `%` のように CSS のセレクタで特別な意味を持つ記号は、`.deco-\%` のようにエスケープして書きます。

## エスケープと URL の検査

既定のハンドラは、テキストと属性値をすべてエスケープします。
`javascript:` と `vbscript:` のスキームは href と src の両方から落とし、`data:` は href からだけ落とします。
`data:` 画像には正当な使い道があるためです。

スキームの判定では、先に空白と制御文字を落とします。
ブラウザは途中にタブや改行が挟まった `javascript:` もスキームとして解釈するので、それを潰すためです。

ハンドラが返した hast のテキストと属性値も、文字列にするときにエスケープされます。
**`highlight` が返した文字列と、`raw` ノードはそのまま埋め込みます。**
そこでのエスケープと、URL の検査は書いた人の責任になります。
同じことをするための部品を export しています。

| export                  | 役割                                                                          |
| :---------------------- | :---------------------------------------------------------------------------- |
| `escapeHtml(value)`     | `& < > " '` を実体参照にします                                                |
| `safeHref(url)`         | href に入れて安全な URL だけを返します。script が動くスキームなら `null` です |
| `safeSrc(url)`          | src 版です。`data:` 画像は許します                                            |
| `defaultPageUrl(title)` | `pageUrl` の既定の実装です                                                    |
| `defaultClassNames`     | 既定の class 名です                                                           |

外部リンクを別タブで開く例を示します。

```ts
import { safeHref, toHtml } from '@cosense-toolbox/parser/html'

toHtml(page, {
  handlers: {
    externalLink: (node, ctx) => ({
      type: 'element',
      tagName: 'a',
      properties: {
        className: ctx.options.classNames.externalLink?.split(' '),
        href: safeHref(node.target) ?? undefined,
        target: '_blank',
        rel: 'noreferrer',
      },
      children: [{ type: 'text', value: node.label }],
    }),
  },
})
```

木全体に手を入れる場合 (見出しに id を振る、外部リンクをまとめて別タブにする) は、`toHast` の出力に rehype のプラグインを通すこともできます。

信頼できないページを表示する場合は、許可する画像 URL の制限も呼び出し側で行ってください。

ここまでが HTML への変換です。
HTML 以外の形式が必要な場合は、次のページに進んでください。
