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
| コンポーネント行 (`.csnx`) | `meta.tag.component.cosense` |

`[-* x]` のように記号を重ねると、それぞれのスコープが全部付く。

## Language Server との関係

Zed は TextMate 文法を読まないので、Zed の色は
[`@cosense-toolbox/language-server`](../language-server) の semantic tokens から来る。
こちらはパーサーそのもので読み、この文法は正規表現でそれに寄せている。

両者が同じところに同じ色を付けることは、テストで 1 文字ずつ突き合わせて確かめている
(`src/parity.test.ts`。パーサーの conformance fixture と examples の記事が対象)。
記法の読み方を変えたら、両方をそろえないとこのテストが落ちる。

## 分かっている差

- **Shiki では、空行でコードブロックと表が終わらない。** Shiki は空行を文法に通さずに飛ばすため、
  空行の次の行が深く字下げされていると、ブロックの続きとして色が付く。VS Code では終わる。
- 字下げの深さは「ヘッダ行と同じ空白に続けて、さらに空白がある」で見ている。
  タブと空白を混ぜて字下げしたページでは、パーサーとブロックの範囲がずれることがある。
- `code:` ブロックの中身は、ファイル名の言語では色付けしない。
