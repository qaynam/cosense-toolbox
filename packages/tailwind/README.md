# @cosense-toolbox/tailwind

Tailwind CSS のプラグイン。`class="cosense"` を付けた要素の中に、Cosense (旧 Scrapbox) の記法を描画した HTML の既定の見た目を当てる。
typography プラグインの `prose` と同じ使い方をする。

当てるスタイルは [`@cosense-toolbox/style`](../style) と同じもの。
Tailwind を使っているなら、style.css を別に読み込まなくてよい。

> **beta**：class 名や出力はまだ変わりうる。

## インストール

```sh
npm install -D @cosense-toolbox/tailwind@beta
```

Tailwind v4 の CSS に `@plugin` で足す。

```css
@import 'tailwindcss';
@plugin "@cosense-toolbox/tailwind";
```

## 基本の使い方

描画した HTML を `class="cosense"` の要素で包む。

```astro
<article class="cosense">
  <Content />
</article>
```

`@cosense-toolbox/parser` の `toHtml` の出力も同じように包めばよい。

```astro
<article class="cosense" set:html={toHtml(page)} />
```

## 要素ごとに調整する

`cosense-{記法}:{utility}` の modifier で、記事の中の特定の記法にだけ utility を当てられる。
包んでいる要素に付けるので、記事の HTML には手を入れなくてよい。

```html
<article
  class="cosense cosense-link:text-sky-700 cosense-link:hover:underline cosense-code:bg-slate-100 cosense-title:text-4xl"
>
  …
</article>
```

`cosense-link:hover:underline` のように続けて書くと、リンクを hover したときだけ当たる。
`md:cosense-title:text-5xl` や `dark:cosense-link:text-sky-300` のように、画面幅やダークモードの variant とも組み合わせられる。

| Modifier                          | Target                         | 記法                                                        |
| :-------------------------------- | :----------------------------- | :---------------------------------------------------------- |
| `cosense-title:{utility}`         | `.title`                       | タイトル (1 行目)                                           |
| `cosense-line:{utility}`          | `.line`                        | 各行                                                        |
| `cosense-heading:{utility}`       | `.decoration[data-size-level]` | `[** 見出し]` などの大きな文字                              |
| `cosense-strong:{utility}`        | `strong`                       | `[[太字]]` `[* 太字]`                                       |
| `cosense-em:{utility}`            | `em`                           | `[/ 斜体]`                                                  |
| `cosense-s:{utility}`             | `s`                            | `[- 打ち消し]`                                              |
| `cosense-u:{utility}`             | `u`                            | `[_ 下線]`                                                  |
| `cosense-link:{utility}`          | `.link`                        | リンクすべて (`[ページ]` `[https://…]` `[/project/ページ]`) |
| `cosense-link-external:{utility}` | `.link-external`               | 外部リンク `[https://…]`                                    |
| `cosense-link-project:{utility}`  | `.link-project`                | 別プロジェクトへのリンク `[/project/ページ]`                |
| `cosense-hashtag:{utility}`       | `.hashtag`                     | `#タグ`                                                     |
| `cosense-code:{utility}`          | `.code`                        | `` `コード` ``                                              |
| `cosense-code-block:{utility}`    | `.code-block > code`           | `code:ファイル名` のブロックの各行                          |
| `cosense-code-filename:{utility}` | `.code-block-start`            | `code:ファイル名` のファイル名                              |
| `cosense-quote:{utility}`         | `.quote`                       | `>` で始まる引用                                            |
| `cosense-table:{utility}`         | `.table`                       | `table:名前` の表                                           |
| `cosense-td:{utility}`            | `.table td`                    | 表のセル                                                    |
| `cosense-image:{utility}`         | `.image`                       | 画像                                                        |
| `cosense-icon:{utility}`          | `.icon`                        | `[ユーザー名.icon]`                                         |
| `cosense-formula:{utility}`       | `.formula`                     | `[$ 数式]`                                                  |

対象は HTML の要素名ではなく、Cosense の記法で分けている。`toHtml` はリンク・タグ・アイコンのどれにも同じ `<a>` を使うため、要素名では区別できない。
class 名は `toHtml` の既定 (`classNames` を渡さなかったとき) に合わせている。

### 装飾の記号ごとに調整する

`cosense-deco-[記号]:{utility}` で、その記号の装飾 (`[| 文字]` なら `|`) だけに utility を当てられる。
`toHtml` は装飾を `<span class="decoration deco-|">` のように記号ごとの class で出すので、それを選ぶ。

```html
<article
  class="cosense cosense-deco-[|]:border-l-4 cosense-deco-[|]:pl-3 cosense-deco-[|]:text-slate-600"
></article>
```

- 記号を並べると、それらをすべて持つ装飾に当たる。`cosense-deco-[-/]:` は `[-/ 文字]` など
- 下線の記号 `_` は `cosense-deco-[\_]:` と書く。Tailwind は `[...]` の中の `_` を空白に変えるため
- `"` は class 属性の中に書けないので使えない
- パーサーが既定で装飾として読む記号は `*` `/` `-` `_` の 4 つだけ。`|` などほかの記号の装飾を使うときは、パースのときに [`customDecorations`](https://cosense-toolbox.qaynam.dev/parser/extend/) で記号を足す

```js
// astro.config.mjs (@cosense-toolbox/astro)
import { customDecorations } from '@cosense-toolbox/parser/extensions'

cosense({ parseOptions: { extensions: [customDecorations(['|'])] } })
```

## 一部だけ外す

`not-cosense` を付けた要素とその中身には、既定のスタイルも modifier も当てない。`.csnx` に埋め込んだコンポーネントを、ページの見た目から切り離したいときに使う。

```svelte
<aside class="not-cosense">…</aside>
```

## 色や寸法を変える

1 つの記法だけを変えるなら modifier、ページ全体の配色や文字の大きさを変えるなら CSS 変数を使う。
変数は style.css と同じもので、一覧は [`@cosense-toolbox/style` の README](../style/README.md#色を変える) にある。

```html
<article class="cosense [--cosense-link:var(--color-sky-700)] [--cosense-font-size:16px]"></article>
```

ダークモードでは、`dark:` の variant で変数を差し替える。

```html
<article
  class="cosense dark:[--cosense-text:var(--color-slate-200)] dark:[--cosense-bg:var(--color-slate-900)]"
></article>
```

## オプション

```css
@plugin "@cosense-toolbox/tailwind" {
  classname: article;
}
```

| オプション  | 既定      | 内容                                                                                                                                 |
| :---------- | :-------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `className` | `cosense` | スタイルを当てる class 名。除外の class 名は `not-{className}`、modifier は `{className}-link:` `{className}-deco-[…]:` のようになる |

## style.css との違い

- style.css の `.page` を `.cosense` に置き換えている。宣言はすべて同じ
- 各ルールのセレクタを `:where()` で包み、どのルールも `.cosense` 1 つぶんの詳細度 (0,1,0) にしている。typography と同じ作り
  - 包むと元の詳細度の差が無くなるので、ルールは元の詳細度の低い順 (同じなら style.css に書いた順) に並べ直して出す。同じ詳細度のルールどうしは後ろに書いたものが勝つので、どの要素でも style.css と同じルールが勝つ
  - modifier のルールは既定のスタイルより後ろに、同じ詳細度で出るので、既定のスタイルに勝つ
- 各ルールに `:not(:where([class~="not-cosense"], [class~="not-cosense"] *))` が付く。`:where()` の中なので詳細度は増えない

## 開発

スタイルの正は `packages/style/style.css`。このパッケージの `src/styles.generated.ts` は、そこから機械的に作ったもの。

```sh
bun run generate   # style.css を直したら作り直す
bun run test       # 作り直し忘れもここで落ちる
bun run compare    # style.css とプラグインで、ブラウザの計算済みスタイルが一致するかを確かめる
```

`bun run compare` は、parser の記法仕様のページをすべて描画し、style.css で表示したものとプラグインで表示したものの全要素のスタイルを突き合わせる。あわせて、modifier がどれも対象の要素で既定のスタイルに勝つことを確かめる。
Chromium が要るので、`npx playwright install chromium` で入れるか、手元の Chromium を `CHROMIUM_PATH` で渡す。

`examples/astro-blog` はこのパッケージの `dist/` を読む。プラグインを直したら `bun run build` してから example を動かす。作り直さないと、新しい modifier は Tailwind に知られていない variant として黙って捨てられる。

## ライセンス

MIT。
