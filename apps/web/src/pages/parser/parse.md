---
layout: ../../layouts/Doc.astro
title: パース
description: parse / parseLine / tokenizeInline / createParser の使い分け
---

# パース

ここからは、Cosense のテキストを AST に変換する関数を見ていきます。
すべて `@cosense-toolbox/parser` から import します。

どれも例外を投げず、どんな入力でも必ず値を返します。
記法として成立しない部分は素のテキストになるだけでエラーにはならないので、`try` で囲む必要はありません。

## parse

```ts
parse(source: string, options?: ParseOptions): Page
```

ページ全文を受け取り、ブロックの並びを返します。
[概要](/parser/)で使ったのもこの関数です。

```ts
import { parse } from "@cosense-toolbox/parser";

const page = parse("タイトル\nこれは [リンク] です");

for (const block of page.children) {
  switch (block.type) {
    case "title":
      console.log("title:", block.value);
      break;
    case "line":
      console.log(
        "line:",
        block.children.map((node) => node.type),
      );
      break;
    case "codeBlock":
      console.log(
        block.filename,
        block.lines.map((line) => line.value),
      );
      break;
    case "table":
      console.log(block.name, block.rows.length);
      break;
    default:
      break;
  }
}
```

1 行目は無条件でタイトルとして扱います。
`code:` と `table:` は複数行にまたがるので、ページの文脈があって初めてブロックにまとまります。

ここで出てきた `title` や `line` といったブロックの中身は、[AST と位置情報](/parser/ast/)で詳しく扱います。

## parseLine

```ts
parseLine(raw: string, origin?: { line?: number; offset?: number }): LineBlock
```

エディタのように行単位で扱うときのために、1 行だけを通常行としてパースします。

```ts
import { parseLine } from "@cosense-toolbox/parser";

parseLine("  > [リンク]");
// LineBlock { indent: 2, quote: true, monospace: false, children: [...] }
```

ページの文脈がないので、`code:` と `table:` は**ブロックになりません**。

```ts
parseLine("code:foo.js");
// LineBlock { children: [{ type: 'text', value: 'code:foo.js' }] }
```

コードブロックやテーブルが必要な処理には `parse` を使ってください。

`origin` にその行がページの何行目かを渡すと、位置情報がページ全体と揃います。

## tokenizeInline

```ts
tokenizeInline(source: string, options?: TokenizeOptions): readonly InlineNode[]
```

行の中だけを解析してインラインノードの並びを返す関数で、インデントや引用の判定はしません。

```ts
import { tokenizeInline } from "@cosense-toolbox/parser";

tokenizeInline("[* 太字] と [リンク]");
// [ Decoration, TextNode, InternalLink ]
```

改行を含まない 1 行分の文字列を渡してください。

## createParser

```ts
createParser(options?: ParserOptions): { parse; parseLine; tokenizeInline }
```

拡張を固定したパーサーを作るので、同じ拡張で何度もパースするときに毎回 `extensions` を渡さずに済みます。

```ts
import { createParser } from "@cosense-toolbox/parser";

// mentions の作りかたは「記法の拡張」にあります
const parser = createParser({ extensions: [mentions] });

parser.parse("タイトル\n@qaynam に確認する");
parser.parseLine("@qaynam に確認する");
```

拡張そのものの書きかたは[記法の拡張](/parser/extend/)で説明します。

## asImageSrc

```ts
asImageSrc(url: string): string | null
```

画像 URL を `<img src>` に入れられる形にして、画像でなければ `null` を返します。

```ts
import { asImageSrc } from "@cosense-toolbox/parser";

asImageSrc("https://gyazo.com/503a911fea542532aa5aba0a88eb7b60");
// → 'https://i.gyazo.com/503a911fea542532aa5aba0a88eb7b60.png'

asImageSrc("https://example.test/page");
// → null
```

Gyazo のページ URL は画像そのものではないので、ここでだけ画像 URL に差し替わります。
`parse` は AST にソースの文字列をそのまま残すため、この変換をしません。

この使い分けの理由は、次のページの[画像の src は書き換えない](/parser/ast/#画像の-src-は書き換えない)で説明します。

## normalizeLineEndings

```ts
normalizeLineEndings(source: string): string
```

CRLF と CR を LF に揃えます。
`parse` は必ずこれを通してから解析するので、位置情報を自分で計算するときに使ってください。

これで、テキストから AST を作る方法は一通りです。
次のページでは、できあがった AST の中身を見ていきます。
