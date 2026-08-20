---
layout: ../../layouts/Doc.astro
title: AST の走査
description: visit / find / collect / collectLinks / firstImage / rawTextOf
---

# AST の走査

AST の形が分かったので、そこから欲しいものを取り出します。
このページの関数はすべて `@cosense-toolbox/parser/utils` から import します。

この層はパーサー本体を import しないので、AST を作る側と使う側を別々にバンドルできます。
サーバーでパースして AST を保存し、クライアントでは走査だけを行う、といった分けかたができます。

以降の例では、次の `page` を使います。

```ts
import { parse } from '@cosense-toolbox/parser'

const page = parse(`関連ページ
[JavaScript] と [TypeScript] を比べる
#メモ`)
```

## visit

```ts
visit(tree, type?, visitor): void
```

木を深さ優先で辿ります。
型を渡すと、その型のノードだけが visitor に届きます。

```ts
import { visit } from '@cosense-toolbox/parser/utils'

visit(page, 'internalLink', (node) => {
  console.log(node.target)
})
```

visitor の戻り値で走査を制御できます。

| 戻り値 | 挙動 |
| :--- | :--- |
| `'skip'` | そのノードの子を辿りません |
| `'exit'` | 走査全体を打ち切ります |
| それ以外 | そのまま続けます |

第 2 引数を省くと、すべてのノードが届きます。
visitor の第 2 引数には、ルートからそのノードまでの祖先が配列で渡ります。

このあとの `find` と `collect` と `collectLinks` はいずれも `visit` の上に組み立てた薄い関数なので、やりたいことがそれらに当てはまらないときだけ `visit` を直接使ってください。

## find

```ts
find(tree, type): NodeOfType<K> | null
```

その型の最初のノードを返し、無ければ `null` を返します。

```ts
import { find } from '@cosense-toolbox/parser/utils'

find(page, 'codeBlock') // → CodeBlock | null
```

## collect

```ts
collect(tree, type): NodeOfType<K>[]
```

その型のノードを出現順にすべて返します。

```ts
import { collect } from '@cosense-toolbox/parser/utils'

collect(page, 'icon') // → IconNode[]
```

戻り値の型はノード型から導出されるので、`collect(page, 'icon')` は `IconNode[]` になります。

## collectLinks

```ts
collectLinks(tree, options?: { includeProjectLinks?: boolean }): string[]
```

内部リンクとハッシュタグの指す先を、出現順、重複なしで返します。
`[title]` と `#title` は同じページを指すので 1 件として数えます。

```ts
import { collectLinks } from '@cosense-toolbox/parser/utils'

collectLinks(parse('t\n[A] と #B と [A]')) // → ['A', 'B']
```

`includeProjectLinks` を渡すと `[/project/title]` も含めますが、既定では含めません。

サイトマップの生成、リンク切れの検査、被リンク一覧の表示に使えます。

## firstImage

```ts
firstImage(tree): ImageNode | null
```

ページのサムネイルを選ぶときのために、最初の画像ノードを返します。
無ければ `null` です。

```ts
import { firstImage } from '@cosense-toolbox/parser/utils'

firstImage(page)?.src
```

`src` はソースに書かれた URL のままなので、`<img>` に入れる前に [`asImageSrc`](/parser/parse/#asimagesrc) を通してください。

## rawTextOf

```ts
rawTextOf(source, node): string
```

そのノードがソースで占めていた生テキストを返します。
[`position`](/parser/ast/#position) から切り出すので、記法のマーカーも含みます。

```ts
import { rawTextOf } from '@cosense-toolbox/parser/utils'

const source = 'title\nこれは [リンク] です'
const link = parse(source).children[1].children[1]

rawTextOf(source, link) // → '[リンク]'
```

ここまでが、AST から必要な部分だけを取り出す方法です。
次のページからは、AST 全体を別の形式に変換します。
