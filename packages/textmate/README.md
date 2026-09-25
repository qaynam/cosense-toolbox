# @cosense-toolbox/textmate

> **beta.** スコープ名はまだ変わりえます。安定するまではバージョン固定での利用を推奨します。

Cosense 記法の TextMate 文法。`.csn` 用の `cosense` と、コンポーネント行も読む `.csnx` 用の `cosenseX` がある。
Shiki の `LanguageRegistration` としてそのまま渡せるほか、`.tmLanguage.json` としても同梱している。

```sh
npm i @cosense-toolbox/textmate@beta
```

## Shiki

```ts
import { cosense, cosenseX } from '@cosense-toolbox/textmate'
import { createHighlighter } from 'shiki'

const shiki = await createHighlighter({ themes: ['catppuccin-latte'], langs: [cosense, cosenseX] })
shiki.codeToHtml('タイトル\n[* 太字] [リンク] #tag', { lang: 'cosense', theme: 'catppuccin-latte' })
```

言語名は `cosense` / `cosense-x`、別名は `csn` / `csnx`。Markdown の ```` ```csn ```` にも色が付く。
Astro なら `markdown.shikiConfig.langs` に同じものを渡す。

## ファイルとして使う

```ts
import grammar from '@cosense-toolbox/textmate/cosense.tmLanguage.json' with { type: 'json' }
```

VS Code 拡張の `contributes.grammars` などには、このファイルを指定する。

## スコープ

どのテーマでも色が付くように、スコープはテーマが既に塗っている名前から始めている
(`markup.bold`、`string.other.link`、`markup.raw` など)。一覧は `SCOPES` で取れる。

| 記法 | スコープ |
| --- | --- |
| タイトル (1 行目) | `markup.heading.cosense` |
| `[ページ]` | `string.other.link.internal.cosense` |
| `[/project/ページ]` | `string.other.link.project.cosense` |
| URL、`[ラベル URL]` | `markup.underline.link.external.cosense` |
| 画像 | `markup.underline.link.image.cosense` |
| `[user.icon]` | `string.other.link.icon.cosense` |
| `#tag` | `entity.name.tag.hashtag.cosense` |
| `` `code` `` | `markup.inline.raw.cosense` |
| `code:` ブロック | `markup.raw.block.cosense` |
| `table:` ブロック | `markup.other.table.cosense` |
| `[$ 数式]` | `constant.other.formula.cosense` |
| `>` 引用 | 行全体に `markup.quote.cosense`、記号に `punctuation.definition.quote.begin.cosense` |
| `[* ]` / `[** ]` / `[*** ]` 以上 | `markup.bold.cosense` / `markup.bold.level2.cosense` / `markup.bold.level3.cosense` |
| `[/ ]` `[- ]` `[_ ]` | `markup.italic.cosense` / `markup.strikethrough.cosense` / `markup.underline.cosense` |
| 先頭の `---` で囲んだ YAML | `comment.block.frontmatter.cosense` |
| コンポーネントのタグ名 (`.csnx`) | `support.class.component.cosense` |
| 属性名 | `entity.other.attribute-name.cosense` |
| 引用符で囲んだ属性値 | `string.quoted.attribute-value.cosense` |
| `{ }` で囲んだ属性値 | `meta.embedded.expression.cosense` (中の数値は `constant.numeric.cosense`) |

`[-* x]` のように記号を重ねると、それぞれのスコープが全部付く。

コンポーネント行は行全体に `meta.tag.component.cosense` が付き、行頭のタグだけを JSX として読む。
タグの後ろの文章は、Cosense の記法としても読まない。`.csnx` では 1 行目がタグならタイトルにしない。

## Language Server との関係

Zed は TextMate 文法を読まないので、Zed の色は
[`@cosense-toolbox/language-server`](../language-server) の semantic tokens から来る。
こちらはパーサーそのもので読み、この文法は正規表現でそれに寄せている。

両者が同じところに同じ色を付けることは、テストで 1 文字ずつ突き合わせて確かめている
(`src/parity.test.ts`。パーサーの conformance fixture と examples の記事が対象)。
記法の読み方を変えたら、両方をそろえないとこのテストが落ちる。

## 分かっている差

- **Shiki は空行を文法に通さずに飛ばす。** そのため Shiki でだけ次のことが起きる。VS Code では起きない。
  - 空行でコードブロックと表が終わらない。空行の次の行が深く字下げされていると、ブロックの続きとして色が付く。
  - タイトル行が空行だと、次の行がタイトルとして色付けされる (1 行目が空行のページや、frontmatter の直後が空行のページ)。
- 字下げの深さは「ヘッダ行と同じ空白に続けて、さらに空白がある」で見ている。
  タブと空白を混ぜて字下げしたページでは、パーサーとブロックの範囲がずれることがある。
- `code:` ブロックの中身は、ファイル名の言語では色付けしない。
