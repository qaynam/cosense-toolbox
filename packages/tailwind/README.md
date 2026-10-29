# @cosense-toolbox/tailwind

Tailwind CSS のプラグインです。`class="cosense"` を付けた要素の中に、Cosense (旧 Scrapbox) の記法を描画した HTML の既定スタイルを適用します。
typography プラグインの `prose` と同じ要領で使えます。

適用されるスタイルは [`@cosense-toolbox/style`](../style) と共通です。
Tailwind を使う場合は、`style.css` を別途読み込む必要はありません。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/tailwind/>**

> **beta**：class 名や出力はまだ変わりうる。

### 1.0.0 の変更

- **破壊的変更:** `@cosense-toolbox/parser` 1.0.0 の既定の class 名に合わせ、既定のスタイルと modifier の対象を変えた。
  parser は Cosense Web のエディタと同じ class 名を出すようになった (内部リンクは `.page-link`、表は `.table-block`、タイトルは `.line.line-title`、装飾は `.deco`)。
  `className` で選ぶ包む要素 (既定の `cosense`)、`not-cosense`、modifier の名前 (`cosense-link:` など)、CSS 変数 (`--cosense-*`) は変わらない。
  - **移行:** parser と style も 1.0.0 にそろえる。parser の 0.1.0-beta の出力 (`.link` の内部リンク、`.table`、`.title`) には当たらなくなる。
    記事の HTML に自分で既定の class 名を書いていたところは、parser の README の表のとおりに書き換える。
- `prefix` オプションを足した。parser の `toHtml` に `classPrefix` を渡したときは、同じ値を渡す ([CSS フレームワークの class とぶつかるとき](#css-フレームワークの-class-とぶつかるとき))。
- **不具合の修正:** `cosense-icon:` を、アイコンの画像 (`img.icon`) だけに当てるようにした。
  今までは `.icon` を選んでいて、画像とそれを包むリンクの両方に当たっていた。`p-1` や `m-1` のような余白の utility は、リンクと画像の両方に付いて 2 重になっていた。
  `iconImageUrl` を渡さずにユーザー名のリンクとして出すアイコンには当たらない。リンクのほうは `cosense-link:` で選ぶ。
- 字下げして書いた表 (`table:名前`) を、同じ深さの行の本文と同じ位置に置くようにした (`@cosense-toolbox/style` と同じ)。
  `@cosense-toolbox/parser` 1.0.0 の `toHtml` が表に付ける `data-indent` を見るので、parser も 1.0.0 にそろえる。
- **不具合の修正:** オプションの例の `classname: article;` を `className: article;` に直した。
  プラグインは `className` だけを読むので、例のとおりに書くと class 名が `cosense` のまま変わらなかった。

対象を変えた modifier の、今までと 1.0.0 の対応:

| Modifier           | 今までの対象                   | 1.0.0 の対象             |
| :----------------- | :----------------------------- | :----------------------- |
| `cosense-title:`   | `.title`                       | `.line-title`            |
| `cosense-line:`    | `.line`                        | `.line:not(.line-title)` |
| `cosense-heading:` | `.decoration[data-size-level]` | `.deco[data-size-level]` |
| `cosense-link:`    | `.link`                        | `.page-link, .link`      |
| `cosense-table:`   | `.table`                       | `.table-block`           |
| `cosense-td:`      | `.table td`                    | `.table-block td`        |
| `cosense-icon:`    | `.icon`                        | `img.icon`               |

`cosense-line:` はタイトルを除く。タイトルにも Cosense Web と同じく `.line` が付くようになったが、当たる要素は今までと同じ。

## インストール

```sh
npm install -D @cosense-toolbox/tailwind
```

Tailwind v4 の CSS に `@plugin` で足す。

```css
@import "tailwindcss";
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

| Modifier                          | Target                   | 記法                                                        |
| :-------------------------------- | :----------------------- | :---------------------------------------------------------- |
| `cosense-title:{utility}`         | `.line-title`            | タイトル (1 行目)                                           |
| `cosense-line:{utility}`          | `.line:not(.line-title)` | タイトルを除く各行                                          |
| `cosense-heading:{utility}`       | `.deco[data-size-level]` | `[** 見出し]` などの大きな文字                              |
| `cosense-strong:{utility}`        | `strong`                 | `[[太字]]` `[* 太字]`                                       |
| `cosense-em:{utility}`            | `em`                     | `[/ 斜体]`                                                  |
| `cosense-s:{utility}`             | `s`                      | `[- 打ち消し]`                                              |
| `cosense-u:{utility}`             | `u`                      | `[_ 下線]`                                                  |
| `cosense-link:{utility}`          | `.page-link, .link`      | リンクすべて (`[ページ]` `[https://…]` `[/project/ページ]`) |
| `cosense-link-external:{utility}` | `.link-external`         | 外部リンク `[https://…]`                                    |
| `cosense-link-project:{utility}`  | `.link-project`          | 別プロジェクトへのリンク `[/project/ページ]`                |
| `cosense-hashtag:{utility}`       | `.hashtag`               | `#タグ`                                                     |
| `cosense-code:{utility}`          | `.code`                  | `` `コード` ``                                              |
| `cosense-code-block:{utility}`    | `.code-block > code`     | `code:ファイル名` のブロックの各行                          |
| `cosense-code-filename:{utility}` | `.code-block-start`      | `code:ファイル名` のファイル名                              |
| `cosense-quote:{utility}`         | `.quote`                 | `>` で始まる引用                                            |
| `cosense-table:{utility}`         | `.table-block`           | `table:名前` の表                                           |
| `cosense-td:{utility}`            | `.table-block td`        | 表のセル                                                    |
| `cosense-image:{utility}`         | `.image`                 | 画像                                                        |
| `cosense-video:{utility}`         | `.video`                 | 動画                                                        |
| `cosense-audio:{utility}`         | `.audio`                 | 音声                                                        |
| `cosense-embed:{utility}`         | `.embed`                 | YouTube などの埋め込み                                      |
| `cosense-location:{utility}`      | `.link-location`         | 地図 `[N35,E139]`                                           |
| `cosense-icon:{utility}`          | `img.icon`               | `[ユーザー名.icon]`                                         |
| `cosense-formula:{utility}`       | `.formula`               | `[$ 数式]`                                                  |

対象は HTML の要素名ではなく、Cosense の記法で分けている。`toHtml` はリンク・タグ・アイコンのどれにも同じ `<a>` を使うため、要素名では区別できない。
class 名は `toHtml` の既定 (`classNames` を渡さなかったとき) に合わせている。既定の class 名は Cosense Web のエディタと同じもので、`toHtml` に `classPrefix` を渡したときは、`prefix` オプションで同じ接頭辞を付ける。

### 装飾の記号ごとに調整する

`cosense-deco-[記号]:{utility}` で、その記号の装飾 (`[| 文字]` なら `|`) だけに utility を当てられる。
`toHtml` は装飾を `<span class="deco deco-|">` のように記号ごとの class で出すので、それを選ぶ。

```html
<article
  class="cosense cosense-deco-[|]:border-l-4 cosense-deco-[|]:pl-3 cosense-deco-[|]:text-slate-600"
></article>
```

- 記号を並べると、それらをすべて持つ装飾に当たる。`cosense-deco-[-/]:` は `[-/ 文字]` など
- 下線の記号 `_` は `cosense-deco-[\_]:` と書く。Tailwind は `[...]` の中の `_` を空白に変えるため
- `"` は class 属性の中に書けないので使えない
- パーサーは Cosense の文字装飾の記号 (`!"#%&'()*+,-./{|}<>_~=`) をすべて装飾として読む。見た目が付くのは `*` `/` `-` `_` だけなので、`|` などほかの記号の見た目はここで付ける

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

<!-- prettier は CSS のプロパティ名を小文字にするが、プラグインは className だけを読むので、整形させない -->
<!-- prettier-ignore -->
```css
@plugin "@cosense-toolbox/tailwind" {
  className: article;
}
```

| オプション  | 既定       | 内容                                                                                                                                 |
| :---------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `className` | `cosense`  | スタイルを当てる class 名。除外の class 名は `not-{className}`、modifier は `{className}-link:` `{className}-deco-[…]:` のようになる |
| `prefix`    | (付けない) | parser の `toHtml` に渡した `classPrefix`。既定のスタイルと modifier が選ぶ class 名の前に付ける                                     |

## CSS フレームワークの class とぶつかるとき

`toHtml` の既定の class 名は Cosense Web と同じ `.link` や `.image` なので、DaisyUI の `.link` や Bulma の `.image` のように、CSS フレームワークがページ全体に当てる class とぶつかることがある。
そのときは `toHtml` に `classPrefix` を渡して class 名に接頭辞を付け、プラグインの `prefix` にも同じ値を渡す。
装飾の記号ごとの `deco-*` には、どちらも付けない。

```ts
toHtml(page, { classPrefix: "csn-" }) // <div class="csn-line"><a class="csn-page-link" …>
```

```css
@plugin "@cosense-toolbox/tailwind" {
  prefix: csn-;
}
```

modifier の名前 (`cosense-link:` など) は変わらない。

接頭辞は 2 か所に書くので、ずれると出力にスタイルが当たらなくなる。1 つの JavaScript のファイルに置き、両方から読むとよい。
`@plugin` はプラグインを設定して返す JavaScript のファイルも読める。

```js
// cosense.config.js
export const classPrefix = "csn-"

// cosense-tailwind.js
import cosense from "@cosense-toolbox/tailwind"
import { classPrefix } from "./cosense.config.js"
export default cosense({ prefix: classPrefix })
```

```css
@plugin "./cosense-tailwind.js";
```

```ts
toHtml(page, { classPrefix }) // Astro の統合なら renderOptions: { classPrefix }
```

## style.css との違い

- style.css の `.page` を `.cosense` に置き換えている。宣言はすべて同じ。`prefix` を渡すと、セレクタの class 名に接頭辞を付ける
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

`examples/astro-blog` は npm に公開された版を使う。直したプラグインを example で試すときは、`bun run build` してから `bun link` でつなぐ ([手元のパッケージで試す](../../examples/astro-blog/README.md#手元のパッケージで試す))。作り直さないと、新しい modifier は Tailwind に知られていない variant として黙って捨てられる。

## ライセンス

MIT。
