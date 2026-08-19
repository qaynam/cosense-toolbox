# @cosense-toolbox/parser

Cosense (旧 Scrapbox) 記法のパーサー。
位置情報つきの unist 風 AST を返す。

> **beta**：公開 API はまだ変わりうる。
> 安定するまでは `^` ではなくバージョンを固定して使うほうが安全。

```sh
npm i @cosense-toolbox/parser
```

```ts
import { parse } from '@cosense-toolbox/parser'

const page = parse('タイトル\nこれは [リンク] です')

page.children[1].children
// [ { type: 'text', value: 'これは ', position: {…} },
//   { type: 'internalLink', label: 'リンク', target: 'リンク', position: {…} },
//   { type: 'text', value: ' です', position: {…} } ]
```

- 依存は `effect` だけで、DOM も Node の API も使わない。
- すべてのノードが位置情報を持つので、エディタのハイライトやキャレット連携に使える。
- AST は plain object なので、`JSON.stringify` と `JSON.parse` で往復でき、worklet や postMessage を跨げる。
- 記法と出力の両方をプラグインで拡張できる。
- サブパスごとに export が分かれていて tree-shaking が効く (`parse` だけなら gzip 約 8 KB)。

> このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装である。
> 開発元である Helpfeel社 とは関係がなく、公認も受けていない。

## パース

### parse

ページ全文を受け取り、ブロックの並びを返す。
どんな入力でも例外を投げず、必ず `Page` を返す。

```ts
import { parse } from '@cosense-toolbox/parser'

const page = parse('タイトル\nこれは [リンク] です')

for (const block of page.children) {
  switch (block.type) {
    case 'title':
      console.log('title:', block.value)
      break
    case 'line':
      console.log('line:', block.children.map((node) => node.type))
      break
    case 'codeBlock':
      console.log(block.filename, block.lines.map((line) => line.value))
      break
    case 'table':
      console.log(block.name, block.rows.length)
      break
    default:
      // ノード型は minor で増えうるので default を置く
      break
  }
}
```

`code:` と `table:` は、ページの文脈があって初めてブロックにまとまる。
1 行目は無条件でタイトルとして扱う。

### parseLine

1 行だけを通常行としてパースする。
エディタのように行単位で扱うときに使う。

```ts
import { parseLine } from '@cosense-toolbox/parser'

parseLine('  > [リンク]')
// LineBlock { indent: 2, quote: true, monospace: false, children: [...] }
```

ページの文脈がないので、`code:` と `table:` もブロックにはならず通常行になる。
その行がページの何行目かは `{ line, offset }` で渡せる。位置情報がページ全体と揃う。

### tokenizeInline

行の中だけを解析して、インラインノードの並びを返す。

```ts
import { tokenizeInline } from '@cosense-toolbox/parser'

tokenizeInline('[* 太字] と [リンク]') // → readonly InlineNode[]
```

改行を含まない 1 行分の文字列を渡す。

### createParser

拡張を固定したパーサーを作る。
同じ拡張で何度もパースするときに、毎回 `extensions` を渡さずに済む。

```ts
import { createParser } from '@cosense-toolbox/parser'

const parser = createParser({ extensions: [mentions] })
parser.parse(source)
parser.parseLine(line)
```

### asImageSrc

画像 URL を `<img src>` に入れられる形にする。
画像でなければ `null` を返す。

```ts
import { asImageSrc } from '@cosense-toolbox/parser'

asImageSrc('https://gyazo.com/503a911fea542532aa5aba0a88eb7b60')
// → 'https://i.gyazo.com/503a911fea542532aa5aba0a88eb7b60.png'
asImageSrc('https://example.test/page')
// → null
```

Gyazo のページ URL は画像そのものではないので、ここでだけ画像 URL に差し替わる。
`parse` はこの変換をしない。AST はソースに書かれた文字列を保つ。

### normalizeLineEndings

CRLF と CR を LF に揃える。
`parse` は必ずこれを通してから解析するので、位置情報を自分で計算するときに使う。

## AST

```
Page
├─ TitleBlock   1 行目。value に生テキスト、children にインラインノード
├─ CodeBlock    code:filename とその配下 (CodeLine[])
├─ TableBlock   table:name とその配下 (TableRow[] → TableCell[])
└─ LineBlock    通常の行 (indent / quote / monospace + InlineNode[])
```

インラインノードは次の 10 種類で、すべて `type` で判別できる。

| type | 記法 |
| :--- | :--- |
| `text` | 記法にならなかった素のテキスト |
| `internalLink` | `[title]` |
| `externalLink` | 裸の URL、`[url]`、`[url label]`、`[label url]` |
| `projectLink` | `[/project/title]` (`project` と `title` に分解済み) |
| `hashtag` | `#tag` |
| `inlineCode` | `` `code` `` |
| `image` | `[url.png]`、`[[url.png]]` (large)、`[linkUrl imageUrl]` (link つき) |
| `icon` | `[user.icon]`、`[user.icon*5]` |
| `formula` | `[$ x^2]` |
| `decoration` | `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合、`[[太字]]` |

装飾は Markdown のような入れ子の強調にならない。
Cosense では 1 つの記法が複数の装飾を同時に持つ (`[-/ x]` は打消しかつ斜体) ので、1 ノードが複数のフラグを持つ形にしている。

`image` の `src` はソースに書かれた URL のままで、パーサーは書き換えない。
Gyazo のページ URL (`https://gyazo.com/{hash}`) のように、そのままでは `<img>` に入れられない URL を表示用に直すのは描画側の仕事になる。
その変換は [`asImageSrc`](#asimagesrc) が担当する。

## 位置情報

すべてのノードが `position` を持つ。

```ts
interface Point { line: number; column: number; offset: number }  // すべて 0-based
interface Position { start: Point; end: Point }                   // end は exclusive
```

`line` はページ内の行番号で、0 がタイトル行になる。
`column` は行内の文字オフセット、`offset` はページ全文の中の文字オフセットを指す。

`source.slice(start.offset, end.offset)` は、その記法の生テキスト全体と一致する。
`[` や `#` などのマーカーも含む。

unist は 1-based だが、JS の `slice` とそのまま噛み合うよう 0-based を採用している。
CRLF と CR は LF に正規化されてから解析されるので、位置は正規化後の文字列が基準になる。

ノードの生テキストを切り出すには [`rawTextOf`](#rawtextof) を使う。

## utils

`@cosense-toolbox/parser/utils` は AST を走査して中身を取り出す。
パースはしないので、AST を作る側と使う側を分けて import できる。

### visit

木を深さ優先で辿る。
型を渡すとその型のノードだけが visitor に届く。

```ts
import { visit } from '@cosense-toolbox/parser/utils'

visit(page, 'internalLink', (node) => {
  console.log(node.target)
})
```

visitor は `'skip'` を返すとそのノードの子を辿らず、`'exit'` を返すと走査全体を打ち切る。
第 2 引数を省くとすべてのノードが届く。
visitor の第 2 引数には、ルートからそのノードまでの祖先が配列で渡る。

### find

その型の最初のノードを返す。
無ければ `null`。

```ts
import { find } from '@cosense-toolbox/parser/utils'

find(page, 'codeBlock') // → CodeBlock | null
```

### collect

その型のノードを出現順にすべて返す。

```ts
import { collect } from '@cosense-toolbox/parser/utils'

collect(page, 'icon') // → IconNode[]
```

戻り値の型はノード型から導出されるので、`collect(page, 'icon')` は `IconNode[]` になる。

### collectLinks

内部リンクとハッシュタグの指す先を、出現順、重複なしで返す。

```ts
import { collectLinks } from '@cosense-toolbox/parser/utils'

collectLinks(parse('t\n[A] と #B と [A]')) // → ['A', 'B']
```

### firstImage

最初の画像ノードを返す。
無ければ `null`。ページのサムネイルを選ぶときに使う。

```ts
import { firstImage } from '@cosense-toolbox/parser/utils'

firstImage(page)?.src
```

### rawTextOf

そのノードがソースで占めていた生テキストを返す。
位置情報から切り出すので、記法のマーカーも含む。

```ts
import { rawTextOf } from '@cosense-toolbox/parser/utils'

const source = 'title\nこれは [リンク] です'
const link = parse(source).children[1].children[1]
rawTextOf(source, link) // → '[リンク]'
```

## compile

`@cosense-toolbox/parser/compile` は AST を別の形式に変える。
この層はパーサー本体を import しないので、変換だけを使う側のバンドルにパーサーは入らない。

### toHtml

AST を HTML 文字列にする。
引数はページ全体でなくてもよく、`parseLine` が返した 1 行でも AST の任意のノードでも受け取る。

```ts
import { parse } from '@cosense-toolbox/parser'
import { toHtml } from '@cosense-toolbox/parser/compile'

toHtml(parse('タイトル\nこれは [リンク] です'))
```

```html
<div class="page">
  <h1 class="title">タイトル</h1>
  <div class="line">
    これは <a class="link" href="/%E3%83%AA%E3%83%B3%E3%82%AF">リンク</a> です
  </div>
</div>
```

以降の HTML は読みやすさのために字下げして示す。
実際の出力に要素間の空白は入らない。

既定の見た目は [`@cosense-toolbox/style`](https://github.com/qaynam/cosense-toolbox/blob/main/packages/style/README.md) が別パッケージとして持っている。

#### 出力の形

class 名は接頭辞を持たず、すべて [`classNames`](#classnames) で差し替えられる。

ブロックの対応は次のとおり。

| 記法 | HTML |
| :--- | :--- |
| 1 行目 | `<h1 class="title">タイトル</h1>` |
| 通常の行 | `<div class="line">本文</div>` |
| 字下げした行 | `<div class="line" data-indent="2">本文</div>` |
| 空行 | `<div class="line"><br></div>` |
| `> 引用` | `<blockquote class="quote">引用</blockquote>` |
| `$ ls` | `<code class="monospace">$ ls</code>` |

ページ全体は `<div class="page">` で包まれる。
インデントの深さは class ではなく `data-indent` 属性で表す。
中点は要素を持たず、CSS の擬似要素が描く。
本家と同じ `.indent-mark` と `.pad` と `.dot` の要素が要る場合は [`showPads`](#showpads) を渡す。

テーブルは `<table>` になる。

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

コードブロックは本家と同じく 1 行を 1 要素に切る。

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

本体行はヘッダより 1 段深い `data-indent` を持つ。
それより深い字下げは中身の文字列に残る。

インラインの対応は次のとおり。

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

装飾はフラグの集合を入れ子の要素に開く。

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

見出しの段階は `data-size-level` 属性で表す。

数式は組版せず、記法を外した中身をそのまま置く。
KaTeX に渡したい場合は [`handlers`](#handlers) で差し替える。

アイコンは既定では画像を出さない。
[`iconImageUrl`](#iconimageurl) を渡すと `<img>` が入る。

#### オプション

| オプション | 型 | 既定 |
| :--- | :--- | :--- |
| [`pageUrl`](#pageurl) | `(title, node) => string` | `/{title}` |
| [`iconImageUrl`](#iconimageurl) | `(node) => string \| null` | 常に `null` |
| [`highlight`](#highlight) | `(code, language) => string` | 色付けしない |
| [`classNames`](#classnames) | `HtmlClassNames` | `defaultClassNames` |
| [`showPads`](#showpads) | `boolean` | `false` |
| [`handlers`](#handlers) | `NodeHandlers<string>` | 既定のハンドラ |
| [`style`](#style) | `string` | `<style>` を出さない |

上の 3 つは、記法に書かれていないので AST から導けない情報を外から渡す。
ページをどの URL で配信しているか、アイコン画像がどこにあるか、コードの構文がどう色分けされるかは、どれもソースには存在しない。
残りは出力の見た目と構造を調整する。

#### pageUrl

```ts
pageUrl?: (title: string, node: PageRefNode) => string
```

ページを指す記法の遷移先を決める。
対象は `[title]` と `[/proj/page]` と `#tag` と `[user.icon]` の 4 つ。
アイコンについてはリンク先だけを決め、画像は `iconImageUrl` が決める。

`title` は記法に書かれたタイトルそのままで、`[title]` なら `title`、`[/proj/page]` なら `/proj/page`、`#tag` なら `tag`、`[user.icon]` なら `user` が渡る。
ノード型で分岐する必要はない。

```ts
toHtml(page, { pageUrl: (title) => `/wiki/${encodeURIComponent(title)}` })
```

既定は `/{title}` で、区切りを含むタイトルは区切りを残して各段を encode する。
`defaultPageUrl` として export しているので、独自のハンドラからも呼べる。

外部リンクには効かない。
外部リンクは記法そのものが URL なので、解決するものがない。

#### iconImageUrl

```ts
iconImageUrl?: (node: IconNode) => string | null
```

`[user.icon]` の画像 URL を決める。
`null` を返すと `<img>` を出さず、ユーザー名のテキストリンクになる。

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

既定が `null` なのは、本家の画像 URL がプロジェクト名を含む (`/api/pages/{project}/{user}/icon`) 一方で、記法にプロジェクト名が書かれていないためである。

`[/icons/name.icon]` のように別プロジェクトを指す場合、`node.user` には `/icons/name` が入る。

> **注意**：
> `https://scrapbox.io/api/pages/{project}/{user}/icon` は `Cross-Origin-Resource-Policy: same-origin` を返す。
> scrapbox.io 以外のページの `<img>` からは読めず、`Access-Control-Allow-Origin` も無いので `crossorigin` 属性でも回避できない。
> 別オリジンで表示するなら、自前のサーバーやワーカーで中継してそちらに向ける。

#### highlight

```ts
highlight?: (code: string, language: string) => string
```

コードブロックの中身を色付けする。
シグネチャは markdown-it の同名オプションと同じなので、たいていのハイライタがそのまま嵌る。

```ts
import hljs from 'highlight.js'

toHtml(page, {
  highlight: (code, language) =>
    hljs.highlight(code, { language: hljs.getLanguage(language) ? language : 'plaintext' }).value,
})
```

`language` はファイル名から推測した名前で、拡張子があればそれ、無ければファイル名全体が渡る。
`code:hello.js` なら `js`、`code:python` なら `python` になる。
言語名の綴りはライブラリごとに違うので、必要なら受け取った側で読み替える。

戻り値は HTML としてそのまま埋め込まれるので、エスケープはハイライタの責任になる。

これを渡すと、コードブロックの本体は 1 行 1 要素ではなく 1 つの要素にまとまる。
ハイライタの出力が複数行にまたがるタグを含みうるためで、行で切るとタグが壊れる。
ヘッダ行とファイル名は変わらない。

```html
<div class="line code-block">
  <code class="code-start">
    <span class="code-block-start">a.js</span>
  </code>
</div>
<div class="line code-block" data-indent="1">
  <code class="code-body highlight">…ハイライタの出力…</code>
</div>
```

ライブラリごとの書きかたは次のとおり。

```ts
// Prism
highlight: (code, lang) => Prism.highlight(code, Prism.languages[lang] ?? Prism.languages.plain, lang)

// sugar-high
highlight: (code) => sugarHigh(code)

// Shiki は既定で <pre><code> ごと返すので、structure: 'inline' で中身だけにする
const shiki = await createHighlighter({ themes: ['github-light'], langs: ['js'] })
highlight: (code, lang) => shiki.codeToHtml(code, { lang, theme: 'github-light', structure: 'inline' })
```

ハイライタのテーマ CSS が特定の class を要求する場合は `classNames` で足せる。

```ts
toHtml(page, { highlight, classNames: { codeHighlight: 'highlight hljs' } })
```

#### classNames

```ts
classNames?: HtmlClassNames
```

出力する要素に付ける class 名を差し替える。
指定したキーだけが既定を上書きする。

```ts
toHtml(page, { classNames: { line: 'my-2 leading-7', internalLink: 'text-sky-600 underline' } })
```

値は置き換えであって追加ではない。
既定の名前を残したまま足すなら `'line my-2'` のように自分で並べる。
空文字を渡すと class 属性そのものを出さない。

既定の一覧は `defaultClassNames` として export している。
キーはノード型のほか、要素を持つ細部にも用意してある。

| キー | 対象 |
| :--- | :--- |
| `page` `title` `line` | ページ全体、1 行目、通常の行 |
| `quote` `monospace` | 引用行の `<blockquote>`、等幅行の `<code>` |
| `codeBlock` | コードブロックに属する行 (ヘッダと本体の両方) |
| `codeStart` `codeFilename` `codeBody` `codeHighlight` | ヘッダの `<code>`、ファイル名、本体の `<code>`、色付けした本体に足す class |
| `indentMark` `pad` `dot` | `showPads` のときだけ出る要素 |
| `internalLink` `externalLink` `projectLink` `hashtag` | 各リンク |
| `inlineCode` `image` `icon` `formula` `decoration` `table` | 各インライン記法とテーブル |

#### showPads

```ts
showPads?: boolean
```

インデントを本家と同じ要素として書き出す。
深さ 1 段につき `pad` が 1 つ並び、その右端に中点が付く。

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

既定では要素を出さず、深さは `data-indent` 属性だけで表す。
中点は CSS の擬似要素で描けるので、見た目はどちらでも変わらない。

#### handlers

```ts
handlers?: NodeHandlers<string>
```

ノード型ごとの出力そのものを差し替える。
既定のハンドラに自動で重ねられるので、変えたい型だけ書けばよい。

```ts
toHtml(page, {
  handlers: { formula: (node) => katex.renderToString(node.value) },
})
```

ハンドラは `(node, ctx)` を受け取る。
`ctx.children(node)` で子ノードの変換結果が配列で得られる。

```ts
handlers: {
  line: (node, ctx) => `<p>${ctx.children(node).join('')}</p>`,
}
```

既定のハンドラ一式は `createHtmlHandlers(options)` で取れる。
既定の出力を包みたいときに使う。

拡張が足した独自のノード型も、`InlineNodeMap` を declaration merging で拡張してあればここのキーになる。
ハンドラを書かなかった独自ノードは、子があればその中身が出力される。

#### style

```ts
style?: string
```

渡した CSS を `<style>` 要素として出力の先頭に差し込む。

```ts
import css from '@cosense-toolbox/style/style.css?raw'

toHtml(page, { style: css })
// <style>…</style><div class="page">…</div>
```

iframe の `srcdoc` のように、1 つの文字列で完結させたいときに使う。
CSS そのものはこのパッケージに含まれていない。

#### 独自のハンドラを書く

`handlers` で要素ごと差し替えると、既定のハンドラがやっているエスケープと URL の検査が無くなる。
同じことをするための部品を export している。

| export | 役割 |
| :--- | :--- |
| `escapeHtml(value)` | `& < > " '` を実体参照にする |
| `safeHref(url)` | href に入れて安全な URL だけを返す。script が動くスキームなら `null` |
| `safeSrc(url)` | src 版。`data:` 画像は許す |
| `defaultPageUrl(title)` | `pageUrl` の既定の実装 |
| `defaultClassNames` | 既定の class 名 |

外部リンクを別タブで開く例を示す。

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

ハンドラは `classNames` の設定を受け取らない。
両方を使う場合、class 名は書いた側で決めることになる。

#### エスケープと URL の検査

既定のハンドラは、テキストと属性値をすべてエスケープする。
`javascript:` と `vbscript:` のスキームは href と src の両方から落とし、`data:` は href からだけ落とす。
`data:` 画像には正当な使い道があるためである。

スキームの判定では、先に空白と制御文字を落とす。
ブラウザは途中にタブや改行が挟まった `javascript:` もスキームとして解釈するので、それを潰す。

`handlers` と `highlight` が返した文字列はそのまま埋め込む。
そこでのエスケープは書いた人の責任になる。

### toPlainText

記法を外したテキストを返す。
オプションは無い。

```ts
import { toPlainText } from '@cosense-toolbox/parser/compile'

toPlainText(parse('タイトル\n[* 太字] と [リンク]'))
// 'タイトル\n太字 と リンク'
```

インデントは半角 2 文字、引用は `> ` として残る。
コードブロックとテーブルは中身がそのまま出る。

### createCompiler

HTML 以外を出すときに使う。
`toHtml` も `toPlainText` もこれで書かれている。

```ts
import { createCompiler } from '@cosense-toolbox/parser/compile'

const toMarkdown = createCompiler<string>({
  handlers: {
    internalLink: (node) => `[[${node.target}]]`,
    decoration: (node, ctx) => `**${ctx.children(node).join('')}**`,
    text: (node) => node.value,
  },
  fallback: (node, ctx) => ctx.children(node).join(''),
})
```

`handlers` の型はノード型のマップから導出されるので、ノード型が増えても型が追随する。
`fallback` はハンドラの無いノード型に使われる。

## schema

`@cosense-toolbox/parser/schema` は、worklet や postMessage を跨いで受け取った、本当に `Page` か分からない値を検証する。

```ts
import { decodePage } from '@cosense-toolbox/parser/schema'
import { Either } from 'effect'

const decoded = decodePage(JSON.parse(input))
if (Either.isRight(decoded)) {
  // decoded.right は Page
}
```

パース自体は失敗しないので、このサブパスが要るのは外から来た値を扱うときだけになる。

## plugin

`@cosense-toolbox/parser/plugin` は、記法を足す `InlineConstruct` と `BracketRule` と `Extension`、出力を足す `NodeHandlers` の型を公開する。
このサブパスは型だけを持ち、実行時のコードを含まない。

### 記法を拡張する

`Extension` を作って `parse` か `tokenizeInline` に渡す。
既定のルールより先に試されるので、既存の記法を上書きすることもできる。

```ts
import { Option } from 'effect'
import { parse } from '@cosense-toolbox/parser'
import type { Extension, InlineConstruct } from '@cosense-toolbox/parser/plugin'

const mention: InlineConstruct = (source, index) => {
  if (source[index] !== '@') return Option.none()
  const match = source.slice(index + 1).match(/^[A-Za-z0-9_-]+/)
  if (!match) return Option.none()
  return Option.some({
    node: { type: 'internalLink', label: `@${match[0]}`, target: match[0] },
    length: match[0].length + 1,
  })
}

const mentions: Extension = { constructs: [mention] }
parse(source, { extensions: [mentions] })
```

`[...]` の中身の解釈を足すなら `bracketRules` を使う。
同じ拡張で何度もパースするなら、`createParser({ extensions })` でパーサーを固定できる。

### 独自のノード型を足す

既存のノード型に寄せず新しい `type` を作る場合は、`InlineNodeMap` を declaration merging で拡張する。
mdast と同じ手法で、`NodeHandlers` のキーにも `visit` の型引数にも自動で現れるので、描画まで型が通る。

```ts
declare module '@cosense-toolbox/parser' {
  interface InlineNodeMap {
    mention: { type: 'mention'; user: string; position: Position }
  }
}

// 記法を足す
const mention: InlineConstruct = (source, index) => { /* → { type: 'mention', user } */ }

// 描画を足す
toHtml(page, {
  handlers: { mention: (node) => `<a href="/u/${node.user}">@${escapeHtml(node.user)}</a>` },
})
```

ハンドラを書かなかった独自ノードは、子があればその中身が出力される。

## 設計

パースは総関数で、どんな入力でも例外を投げず必ず `Page` を返す。
記法として成立しない部分は素のテキストになるだけで、エラーにはならない。

I/O をしない。
oEmbed の取得や動画判定のような URL の意味解決は、このパッケージの外の仕事になる。
画像かどうかの判定だけは、記法の構造そのものを決めるので含んでいる。

構造は micromark の「位置つきノードと記法ハンドラの登録制」と、markdown-it の「優先順位付きルールを先頭から試す」形を参考にしている。

開発時の規約は [CLAUDE.md](./CLAUDE.md) にある。

## 互換性の方針

| 変更 | バージョン |
| :--- | :--- |
| 新しいノード `type` の追加 | minor |
| 既存ノードへの optional フィールド追加 | minor |
| オプションへの optional フィールド追加 | minor |
| 既存ノードのフィールドの削除、型変更、必須化 | major |
| `position` の意味論の変更 | major |
| ノード `type` 文字列のリネーム | major |

ノード型は minor で増えうるので、`switch (node.type)` には `default` を置いておくとよい。

## ライセンス

MIT
