---
layout: ../../layouts/Doc.astro
title: AST を調べる
description: visit / find / collect / collectLinks / firstImage / rawTextOf
---

# AST を調べる

すべて `@cosense-toolbox/parser/utils` から import する。
この層はパーサー本体を import しないので、AST を作る側と使う側を分けてバンドルできる。

## visit

```ts
visit(tree, type?, visitor): void
```

木を深さ優先で辿る。
型を渡すとその型のノードだけが visitor に届く。

```ts
import { visit } from '@cosense-toolbox/parser/utils'

visit(page, 'internalLink', (node) => {
  console.log(node.target)
})
```

visitor の戻り値で走査を制御する。

| 戻り値 | 挙動 |
| :--- | :--- |
| `'skip'` | そのノードの子を辿らない |
| `'exit'` | 走査全体を打ち切る |
| それ以外 | そのまま続ける |

第 2 引数を省くとすべてのノードが届く。
visitor の第 2 引数には、ルートからそのノードまでの祖先が配列で渡る。

## find

```ts
find(tree, type): NodeOfType<K> | null
```

その型の最初のノードを返す。無ければ `null`。

```ts
import { find } from '@cosense-toolbox/parser/utils'

find(page, 'codeBlock') // → CodeBlock | null
```

## collect

```ts
collect(tree, type): NodeOfType<K>[]
```

その型のノードを出現順にすべて返す。

```ts
import { collect } from '@cosense-toolbox/parser/utils'

collect(page, 'icon') // → IconNode[]
```

戻り値の型はノード型から導出されるので、`collect(page, 'icon')` は `IconNode[]` になる。

## collectLinks

```ts
collectLinks(tree, options?: { includeProjectLinks?: boolean }): string[]
```

内部リンクとハッシュタグの指す先を、出現順、重複なしで返す。
`[title]` と `#title` は同じページを指すので 1 件として数える。

```ts
import { collectLinks } from '@cosense-toolbox/parser/utils'

collectLinks(parse('t\n[A] と #B と [A]')) // → ['A', 'B']
```

`includeProjectLinks` を渡すと `[/project/title]` も含める。既定は含めない。

サイトマップの生成、リンク切れの検査、被リンク一覧の表示に使える。

## firstImage

```ts
firstImage(tree): ImageNode | null
```

最初の画像ノードを返す。無ければ `null`。
ページのサムネイルを選ぶときに使う。

```ts
import { firstImage } from '@cosense-toolbox/parser/utils'

firstImage(page)?.src
```

## rawTextOf

```ts
rawTextOf(source, node): string
```

そのノードがソースで占めていた生テキストを返す。
位置情報から切り出すので、記法のマーカーも含む。

```ts
import { rawTextOf } from '@cosense-toolbox/parser/utils'

const source = 'title\nこれは [リンク] です'
const link = parse(source).children[1].children[1]

rawTextOf(source, link) // → '[リンク]'
```
