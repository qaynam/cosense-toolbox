# @cosense-toolbox/markdown

Markdown を Cosense (旧 Scrapbox) のページとして読みます。ChatGPT の回答や README のような Markdown を、Cosense の AST にできます。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/markdown/>**

> **beta**：公開 API や出力はまだ変わりうる。

## インストール

```sh
npm install @cosense-toolbox/markdown
```

## 使い方

`fromMdast` は mdast (Markdown の AST) を Cosense のページの AST にする。`@cosense-toolbox/parser` の `parse` と同じ型の AST なので、`toHtml` で描画したり、`toCosenseText` で Cosense のページに貼れるテキストにしたりできる。

```ts
import { fromMarkdown } from "mdast-util-from-markdown"
import { toCosenseText } from "@cosense-toolbox/parser/compile"
import { fromMdast } from "@cosense-toolbox/markdown"

toCosenseText(fromMdast(fromMarkdown("## 予定\n\n- **会議**の資料を作る")))
// → "\n[**** 予定]\n [* 会議]の資料を作る"
```

- 箇条書きは字下げに、見出しは大きい文字の装飾に、フェンスはコードブロックに、表は表になる
- 先頭が `#` の見出しならページのタイトルになる
- Markdown の文字は文字のまま (`[ページ]` や `#tag` を Cosense のリンクとして読み直さない)
- ノードの `position` は、元になった Markdown のノードの位置を指す

## なぜ parser と別のパッケージか

Markdown との変換に要る部品を、`@cosense-toolbox/parser` を使うだけの人に入れないため。

## ライセンス

MIT
