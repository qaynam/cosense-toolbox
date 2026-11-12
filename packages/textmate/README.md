# @cosense-toolbox/textmate

> **beta.** スコープ名はまだ変わりえます。安定するまではバージョン固定での利用を推奨します。

Cosense 記法に対応する TextMate 文法です。`.csn` 用の `cosense` と、コンポーネント行も認識する `.csnx` 用の `cosenseX` を提供します。
Shiki の `LanguageRegistration` として使えるほか、`.tmLanguage.json` も同梱しています。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/textmate/>**

```sh
npm i @cosense-toolbox/textmate
```

### 1.0.0 の変更

- README のスコープの説明を直した。`SCOPES` が持つのは記法ごとのスコープだけで、文法が付けるスコープの全部ではない。
  `SCOPES` に無いスコープ (引用の行全体の `markup.quote.cosense`、コンポーネント行の `meta.tag.component.cosense`、
  `{ }` の中の `constant.numeric.cosense`、記号に付く `punctuation.*` など) は、README の別の表に載せた。
- README の「Markdown の ` ```csn ` にも色が付く」を、Markdown をコードブロックごとに Shiki で描画するときだけと直した。
  VS Code の Markdown のエディタでは色が付かない (injection grammar を持っていないため)。

## Shiki

```ts
import { cosense, cosenseX } from "@cosense-toolbox/textmate"
import { createHighlighter } from "shiki"

const shiki = await createHighlighter({ themes: ["catppuccin-latte"], langs: [cosense, cosenseX] })
shiki.codeToHtml("タイトル\n[* 太字] [リンク] #tag", { lang: "cosense", theme: "catppuccin-latte" })
```

言語名は `cosense` / `cosense-x`、別名は `csn` / `csnx`。
Markdown をコードブロックごとに Shiki で描画するツールでは、` ```csn ` のコードブロックにも色が付く。
Astro なら `markdown.shikiConfig.langs` に同じものを渡す。

VS Code の Markdown のエディタでは、` ```csn ` のコードブロックに色は付かない。
Markdown の文法の中に埋め込むには injection grammar が要るが、このパッケージは持っていないため。
Markdown の文書を丸ごと Shiki に `lang: "markdown"` で通したときも同じで、コードブロックの中は色が付かない。

## ファイルとして使う

```ts
import grammar from "@cosense-toolbox/textmate/cosense.tmLanguage.json" with { type: "json" }
```

VS Code 拡張の `contributes.grammars` などには、このファイルを指定する。

## スコープ

どのテーマでも色が付くように、スコープはテーマが既に塗っている名前から始めている
(`markup.bold`、`string.other.link`、`markup.raw` など)。

記法ごとのスコープ (次の表) は `SCOPES` で取れる。キーは [`@cosense-toolbox/lsp`](../lsp) の semantic tokens の種類と同じ名前にしている。

| 記法                                     | スコープ                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| タイトル (1 行目)                        | `markup.heading.cosense`                                                              |
| `[ページ]`                               | `string.other.link.internal.cosense`                                                  |
| `[/project/ページ]`                      | `string.other.link.project.cosense`                                                   |
| URL、`[ラベル URL]`                      | `markup.underline.link.external.cosense`                                              |
| 画像                                     | `markup.underline.link.image.cosense`                                                 |
| 動画・音声・地図・YouTube などの埋め込み | `markup.underline.link.media.cosense`                                                 |
| `[user.icon]`                            | `string.other.link.icon.cosense`                                                      |
| `#tag`                                   | `entity.name.tag.hashtag.cosense`                                                     |
| `` `code` ``                             | `markup.inline.raw.cosense`                                                           |
| `code:` ブロック                         | `markup.raw.block.cosense`                                                            |
| `table:` ブロック                        | `markup.other.table.cosense`                                                          |
| `[$ 数式]`                               | `constant.other.formula.cosense`                                                      |
| `>` 引用の記号                           | `punctuation.definition.quote.begin.cosense`                                          |
| `[* ]` / `[** ]` / `[*** ]` 以上         | `markup.bold.cosense` / `markup.bold.level2.cosense` / `markup.bold.level3.cosense`   |
| `[/ ]` `[- ]` `[_ ]`                     | `markup.italic.cosense` / `markup.strikethrough.cosense` / `markup.underline.cosense` |
| 先頭の `---` で囲んだ YAML               | `comment.block.frontmatter.cosense`                                                   |
| コンポーネントのタグ名 (`.csnx`)         | `support.class.component.cosense`                                                     |
| 属性名                                   | `entity.other.attribute-name.cosense`                                                 |
| 引用符で囲んだ属性値                     | `string.quoted.attribute-value.cosense`                                               |
| `{ }` で囲んだ属性値                     | `meta.embedded.expression.cosense`                                                    |

`[-* x]` のように記号を重ねると、それぞれのスコープが全部付く。

次のスコープは `SCOPES` に入っていない。行全体や記号、`{ }` の中に付くもので、テーマで塗り分けたいときに使う。

| 付く場所                                         | スコープ                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `>` 引用の行全体                                 | `markup.quote.cosense`                                                                    |
| `code:` と `table:`                              | `keyword.other.block.cosense`                                                             |
| `code:` と `table:` の後ろのファイル名・表の名前 | `entity.name.section.block.cosense`                                                       |
| 表のセルを区切るタブ                             | `punctuation.separator.table-cell.cosense`                                                |
| コンポーネント行の全体 (`.csnx`)                 | `meta.tag.component.cosense`                                                              |
| タグの `<` `</` と `>` `/>`                      | `punctuation.definition.tag.begin.cosense` / `punctuation.definition.tag.end.cosense`     |
| 属性の `=`                                       | `punctuation.separator.key-value.cosense`                                                 |
| 属性値の `{` と `}`                              | `punctuation.section.embedded.begin.cosense` / `punctuation.section.embedded.end.cosense` |
| `{ }` の中の文字列・数値・`true` などの値        | `string.quoted.cosense` / `constant.numeric.cosense` / `constant.language.cosense`        |

コンポーネント行は行全体に `meta.tag.component.cosense` が付き、行頭のタグだけを JSX として読む。
タグの後ろの文章は、Cosense の記法としても読まない。`.csnx` では 1 行目がタグならタイトルにしない。

## Language Server との関係

Zed は TextMate 文法を読まないので、Zed の色は
[`@cosense-toolbox/lsp`](../lsp) の semantic tokens から来る。
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
