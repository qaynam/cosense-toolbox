# @cosense-toolbox/markdown

Markdown を Cosense (旧 Scrapbox) のページとして読みます。ChatGPT の回答や README のような Markdown を、Cosense のページに貼れる記法のテキストや、Cosense の AST にできます。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/markdown/>**

> **beta**：公開 API や出力はまだ変わりうる。

## インストール

```sh
npm install @cosense-toolbox/markdown
```

## 使い方

Cosense に貼るテキストが欲しいなら `markdownToCosenseText` を使う。1 行目はタイトルで、Markdown の先頭が `#` の見出しならそれがタイトルになる。

```ts
import { markdownToCosenseText } from "@cosense-toolbox/markdown"

markdownToCosenseText("## 予定\n\n- **会議**の資料を作る\n- [議事録](https://example.com)を読む")
// → "\n[**** 予定]\n [* 会議]の資料を作る\n [議事録 https://example.com]を読む"
```

AST が欲しいなら `parseFromMarkdown` を使う。`@cosense-toolbox/parser` の `parse` と同じ型の AST なので、`toHtml` などにそのまま渡せる。

```ts
import { parseFromMarkdown } from "@cosense-toolbox/markdown"
import { toHtml } from "@cosense-toolbox/parser/html"

toHtml(parseFromMarkdown(markdown))
```

## オプション

| オプション                | 渡せる関数              | 意味                                                             |
| :------------------------ | :---------------------- | :--------------------------------------------------------------- |
| `math`                    | 両方                    | `$...$` と `$$...$$` を数式 (`[$ ]`) として読むか。既定は `true` |
| `handlers` / `extensions` | `markdownToCosenseText` | `toCosenseText` と同じ。書き出しを変える                         |

数式は CommonMark にも GFM にも無い拡張なので、pandoc と同じ決まりで読む。`$x^2$` は `[$ x^2]` になり、`$5と$10` のような値段は数式にしない。`math: false` なら `$` はすべて文字のまま残る。

```ts
// ### の見出しを [** ] にする
markdownToCosenseText(markdown, {
  extensions: [
    { decoration: (output, node) => (node.sizeLevel === 2 ? output.replace("***", "**") : output) },
  ],
})
```

## 気をつけること

### 1 行目はいつもタイトル

`markdownToCosenseText` の 1 行目はタイトルになる。Markdown の先頭が `#` の見出しでなければ、タイトルは空になり、出力は空行から始まる。逆に、先頭が `#` の見出しなら、その見出しはタイトルになり、本文には残らない。

ページの途中に貼るときは、1 行目を除いて使う。

```ts
const body = markdownToCosenseText(markdown).split("\n").slice(1).join("\n")
```

### Markdown の文字が、貼ると Cosense の記法として読まれることがある

Cosense の記法にはエスケープが無い。そのため、Markdown ではただの文字でも、書き出したテキストを貼ると、Cosense の記法として読まれることがある。AST (`parseFromMarkdown`) の中では、文字のノードのまま残る。

| Markdown              | 書き出したテキスト  | Cosense での読まれかた         |
| :-------------------- | :------------------ | :----------------------------- |
| `issue #123 を直す`   | `issue #123 を直す` | `#123` がハッシュタグになる    |
| `[ページ] を見る`     | `[ページ] を見る`   | `[ページ]` がリンクになる      |
| `\$ npm i` (行の先頭) | `$ npm i`           | コマンドの行になる             |
| `\> a` (行の先頭)     | `> a`               | 引用の行になる                 |
| `**a]b**`             | `[* a]b]`           | 装飾が `]` で閉じ、`b]` が残る |

## mdast から読む

remark などで作った mdast が手元にあるなら、`fromMdast` に渡す。記法の対応はここで決まり、`markdownToCosenseText` と `parseFromMarkdown` も中でこれを使っている。

```ts
import { toCosenseText } from "@cosense-toolbox/parser/compile"
import { fromMdast } from "@cosense-toolbox/markdown"

toCosenseText(fromMdast(mdast))
```

## なぜ parser と別のパッケージか

Markdown を読む部品 (micromark と `mdast-util-from-markdown`) は大きいので、`@cosense-toolbox/parser` を使うだけの人に入れないため。

## ライセンス

MIT
