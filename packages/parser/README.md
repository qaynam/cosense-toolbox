# @cosense-toolbox/parser

> **beta.** 公開 API はまだ変わりえます。安定するまでは `^` ではなくバージョン固定での利用を推奨します。

Cosense (旧 Scrapbox) 記法のパーサー。位置情報つきの unist 風 AST を返す。

- **依存は `effect` だけ**。DOM も Node の API も使わない純粋な TypeScript
- **すべてのノードが位置情報を持つ**ので、エディタのハイライトやキャレット連携に使える
- **AST は plain object**。`JSON.stringify` / `JSON.parse` で往復でき、worklet や postMessage を跨げる
- **プラグインで記法と出力を拡張できる**
- サブパスごとに分かれた export で **tree-shaking が効く** (`parse` だけなら gzip 約 8 KB)

```sh
npm i @cosense-toolbox/parser
```

> このパッケージは Cosense (Scrapbox) の記法を解釈する非公式の実装です。
> 開発元である Nota, Inc. とは関係がなく、公認も受けていません。

## 使いかた

```ts
import { parse } from '@cosense-toolbox/parser'

const page = parse(`ページタイトル
これは [リンク] と #タグ です
code:main.ts
 const a = 1`)

for (const block of page.children) {
  switch (block.type) {
    case 'title':
      console.log('title:', block.value)
      break
    case 'line':
      console.log('line:', block.children.map((n) => n.type))
      break
    case 'codeBlock':
      console.log(block.filename, block.lines.map((l) => l.value))
      break
    case 'table':
      console.log(block.name, block.rows.length)
      break
    // 将来ノード型が増えても壊れないよう default を置くことを推奨
    default:
      break
  }
}
```

行単位で扱いたいとき (エディタなど) は `parseLine`、行の中だけ解析したいときは `tokenizeInline`。

```ts
import { parseLine, tokenizeInline } from '@cosense-toolbox/parser'

parseLine('  > [リンク]') // → LineBlock { indent: 2, quote: true, children: [...] }
tokenizeInline('[* 太字]') // → readonly InlineNode[]
```

## AST

```
Page
├─ TitleBlock   1 行目。value に生テキスト、children にインラインノード
├─ CodeBlock    code:filename とその配下 (CodeLine[])
├─ TableBlock   table:name とその配下 (TableRow[] → TableCell[])
└─ LineBlock    通常の行 (indent / quote / monospace + InlineNode[])
```

インラインノードは次の 10 種類。すべて `type` で判別できる。

| type | 記法 |
|---|---|
| `text` | 記法にならなかった素のテキスト |
| `internalLink` | `[title]` |
| `externalLink` | 裸の URL / `[url]` / `[url label]` / `[label url]` |
| `projectLink` | `[/project/title]` (`project` と `title` に分解済み) |
| `hashtag` | `#tag` |
| `inlineCode` | `` `code` `` |
| `image` | `[url.png]` / `[[url.png]]` (large) / `[linkUrl imageUrl]` (link つき) |
| `icon` | `[user.icon]` / `[user.icon*5]` |
| `formula` | `[$ x^2]` |
| `decoration` | `[* 太字]` `[/ 斜体]` `[- 打消し]` `[_ 下線]` とその複合、`[[太字]]` |

装飾は Markdown のような入れ子の強調ではなく、**1 ノードが複数のフラグを同時に持つ**
(`[-/ x]` は打消しかつ斜体)。Cosense の記法の意味論に合わせている。

## 位置情報

すべてのノードが `position` を持つ。

```ts
interface Point { line: number; column: number; offset: number }  // すべて 0-based
interface Position { start: Point; end: Point }                   // end は exclusive
```

- `line` はページ内の行番号 (0 = タイトル行)、`column` は行内の文字オフセット、
  `offset` はページ全文の中の文字オフセット
- `source.slice(start.offset, end.offset)` は**その記法の生テキスト全体**
  (`[` や `#` などのマーカーを含む) と一致する
- unist は 1-based だが、本パッケージは JS の `slice` とそのまま噛み合うよう **0-based** を採用している
- CRLF / CR は LF に正規化されてから解析される。位置は**正規化後**の文字列が基準

```ts
import { rawTextOf } from '@cosense-toolbox/parser/utils'

const source = 'title\nこれは [リンク] です'
const link = parse(source).children[1].children[1]
rawTextOf(source, link) // → '[リンク]'
```

## サブパス

メインエントリはパースだけを持つ。それ以外は opt-in。

### `/utils` — AST の走査と抽出

```ts
import { visit, find, collect, collectLinks, firstImage } from '@cosense-toolbox/parser/utils'

visit(page, 'internalLink', (node) => {
  console.log(node.target)
})

collectLinks(page) // → 内部リンクとハッシュタグを出現順・重複なしで
firstImage(page)   // → 最初の画像ノード (サムネイル用)
```

`visit` の visitor は `'skip'` (子を辿らない) と `'exit'` (走査を打ち切る) を返せる。

### `/compile` — AST から別の形式へ

```ts
import { toPlainText, createCompiler } from '@cosense-toolbox/parser/compile'

toPlainText(page) // 記法を外したテキスト

const toHtml = createCompiler<string>({
  handlers: {
    line: (node, ctx) => `<p>${ctx.children(node).join('')}</p>`,
    internalLink: (node) => `<a href="/${node.target}">${node.label}</a>`,
    text: (node) => node.value,
  },
  fallback: (node, ctx) => ctx.children(node).join(''),
})
```

`handlers` の型はノード型のマップから導出されるので、ノード型が増えても型が追随する。

### `/schema` — 実行時の検証

worklet や postMessage、CLI の `--json` を跨いで受け取った「本当に Page か分からない値」を検証する。

```ts
import { decodePage } from '@cosense-toolbox/parser/schema'
import { Either } from 'effect'

const decoded = decodePage(JSON.parse(input))
if (Either.isRight(decoded)) {
  // decoded.right は Page
}
```

### `/plugin` — プラグイン作者向けの型

## 記法を拡張する

`Extension` を作って `parse` / `tokenizeInline` に渡す。既定のルールより**先に**試されるので、
既存の記法を上書きすることもできる。

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
同じ拡張で何度もパースするなら `createParser({ extensions })` でパーサーを固定できる。

## 設計

- パースは**総関数**。どんな入力でも例外を投げず、必ず `Page` を返す。
  記法として成立しない部分は素のテキストになるだけ
- **I/O をしない**。oEmbed の取得や動画判定のような URL の意味解決はこのパッケージの外の仕事
  (画像かどうかの判定だけは、記法の構造そのものを決めるので含んでいる)
- micromark の「位置つきノード + 記法ハンドラの登録制」と、markdown-it の
  「優先順位付きルールを先頭から試す」構造を参考にしている

設計判断の記録は [PLAN.md](./PLAN.md)、開発時の規約は [CLAUDE.md](./CLAUDE.md) にある。

## 互換性の方針

| 変更 | バージョン |
|---|---|
| 新しいノード `type` の追加 | minor |
| 既存ノードへの optional フィールド追加 | minor |
| オプションへの optional フィールド追加 | minor |
| 既存ノードのフィールド削除・型変更・必須化 | major |
| `position` の意味論の変更 | major |
| ノード `type` 文字列のリネーム | major |

**ノード型は minor で増えうる**ので、`switch (node.type)` には `default` を置くことを推奨する。

## ライセンス

MIT
