# @cosense-toolbox/style

> **beta.** class 名はまだ変わりえます。安定するまではバージョン固定での利用を推奨します。

[`@cosense-toolbox/parser`](../parser) の `toHtml` が出力する HTML に適用する、既定のスタイルシートです。
CSS ファイル1枚だけで構成されているため、独自の見た目を使う場合はインストールする必要はありません。

**ドキュメント → <https://cosense-toolbox.qaynam.dev/style/>**

```sh
npm i @cosense-toolbox/style
```

```ts
import "@cosense-toolbox/style"
```

> ⚠️ これは Cosense (Scrapbox) 本体の CSS **ではありません**。本体の CSS はエディタの DOM
> (`.line > .text > 1 文字ごとの .char-index`) に当てたもので `toHtml` の出力には当たらないため、
> 見た目を寄せた別実装として書き起こしたものです。

Tailwind CSS を使う場合は、この CSS の代わりに [`@cosense-toolbox/tailwind`](../tailwind) を利用できます。
`class="cosense"` を付けた要素の中に同じスタイルが適用されます。

### 1.0.0 の変更

- **破壊的変更:** すべてのルールを、`@cosense-toolbox/parser` 1.0.0 の `csn-` で始まる既定の class 名で書き直した
  (`.page .line` → `.csn-page .csn-line`、下の表)。parser の class 名に接頭辞が無いと、DaisyUI・Bootstrap・Bulma などの
  CSS フレームワークがページ全体に当てる `.link` / `.table` / `.title` / `.image` / `.icon` とぶつかるため。
  CSS 変数 (`--cosense-*`) の名前と、装飾の記号ごとの `deco-*` は変わらない。
  - **移行:** parser も 1.0.0 にそろえる。parser の 0.1.0-beta の出力 (`.page` / `.line`) には当たらなくなる。
    `parseLine` の出力を包むために自分で書いていた `<div class="page">` は `<div class="csn-page">` にする。
    このスタイルを上書きするために自分で書いていたセレクタも、表のとおりに書き換える。
- 字下げして書いた表 (`table:名前`) を、同じ深さの行の本文と同じ位置に置くようにした。
  `@cosense-toolbox/parser` 1.0.0 の `toHtml` が表に付ける `data-indent` を見るので、parser も 1.0.0 にそろえる。

セレクタに使う class 名の、今までと 1.0.0 の対応:

| 今まで              | 1.0.0                 |
| :------------------ | :-------------------- |
| `.page`             | `.csn-page`           |
| `.title`            | `.csn-title`          |
| `.line`             | `.csn-line`           |
| `.quote`            | `.csn-quote`          |
| `.monospace`        | `.csn-monospace`      |
| `.prefix`           | `.csn-command-prefix` |
| `.space`            | `.csn-command-space`  |
| `.command`          | `.csn-command`        |
| `.code-block`       | `.csn-code-block`     |
| `.code-start`       | `.csn-code-start`     |
| `.code-block-start` | `.csn-code-filename`  |
| `.code-body`        | `.csn-code-body`      |
| `.highlight`        | `.csn-code-highlight` |
| `.table`            | `.csn-table`          |
| `.indent-mark`      | `.csn-indent-mark`    |
| `.pad`              | `.csn-pad`            |
| `.dot`              | `.csn-dot`            |
| `.link`             | `.csn-link`           |
| `.link-external`    | `.csn-link-external`  |
| `.link-project`     | `.csn-link-project`   |
| `.hashtag`          | `.csn-hashtag`        |
| `.code`             | `.csn-code`           |
| `.image`            | `.csn-image`          |
| `.video`            | `.csn-video`          |
| `.audio`            | `.csn-audio`          |
| `.embed`            | `.csn-embed`          |
| `.link-location`    | `.csn-link-location`  |
| `.icon`             | `.csn-icon`           |
| `.formula`          | `.csn-formula`        |
| `.decoration`       | `.csn-decoration`     |

## 前提

すべてのルールが `.csn-page` の下にスコープされている。`toHtml(page)` の出力はルートに `.csn-page` を持つので
そのまま当たるが、`parseLine` の 1 行だけを描画する場合は自分で `.csn-page` で包む。

```html
<div class="csn-page">{toHtml(parseLine('[* 太字]'))}</div>
```

## 色を変える

CSS 変数を定義するだけでよい。定義した変数が最優先になる。

```css
:root {
  --cosense-link: #f8e42e;
  --cosense-code-bg: #1b1b1b;
}
```

| 変数                                          | 既定                                                         | 本体テーマの変数          |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------- |
| `--cosense-text`                              | `#4a4a4a`                                                    | `--page-text-color`       |
| `--cosense-title`                             | 本文と同じ                                                   | `--line-title-color`      |
| `--cosense-bg`                                | `#fefefe`                                                    | `--page-bg`               |
| `--cosense-link`                              | `#3d72f5`                                                    | `--page-link-color`       |
| `--cosense-link-hover`                        | `#0d4ff3`                                                    | `--page-link-hover-color` |
| `--cosense-code-text`                         | `#342d9c`                                                    | `--code-color`            |
| `--cosense-code-bg`                           | `rgba(0,0,0,.04)`                                            | `--code-bg`               |
| `--cosense-quote-bg`                          | `rgba(0,0,0,.05)`                                            | `--quote-bg-color`        |
| `--cosense-badge-text` / `--cosense-badge-bg` | `#342d9c` / `#ffcfc6`                                        | —                         |
| `--cosense-font`                              | `"Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif` | —                         |
| `--cosense-font-size`                         | `15px`                                                       | —                         |
| `--cosense-line-height`                       | `1.87`                                                       | —                         |
| `--cosense-code-font`                         | `ui-monospace, …`                                            | —                         |
| `--cosense-line-number`                       | `rgba(0,0,0,.35)`                                            | —                         |
| `--cosense-indent`                            | `1.5em`                                                      | —                         |

「本体テーマの変数」の列は fallback として参照している。Cosense のテーマ変数を持つページに
埋め込めば、`--cosense-*` を書かなくても見た目が揃う。

`.csn-page` は font-family / font-size / line-height を明示している。これを外すと
埋め込み先のページからフォントが降ってきて表示が崩れるため。
既定値は本体のページ本文と同じ **15px / 28px**（body の 14px ではなくエディタ側の値）で、
見出しやコードなど em で書いた寸法はすべてこの基準に乗る。
`--cosense-font-size` を変えれば全体が拡縮する。

アイコンは `a.csn-icon > img.csn-icon` の入れ子。`toHtml` に `iconImageUrl` を渡していないときは
`<img>` が無く、ユーザー名のテキストリンクとして出る。

## インデントの中点

Cosense と同じく、字下げの右端に中点を出す。`toHtml` の既定の出力には中点にあたる要素が
無いので `.csn-line[data-indent]::before` で描いている。

`toHtml(page, { showPads: true })` で Cosense Web と同じ形の `.csn-indent-mark` / `.csn-pad` / `.csn-dot` を
書き出した場合は、擬似要素を止めて要素側のスタイルを使う。どちらでも見た目は同じ。

## コードブロックの行番号

`@cosense-toolbox/parser/html` の `codeLineNumbers()` を描画の拡張 (`extensions`) に渡すと、本体行に `data-line` と `data-line-digits` が付き、このスタイルが行の左に番号の欄を取って番号を出す。
欄の幅はブロックの最後の番号の桁数で決まる。番号は選択の対象にならないので、コードをコピーしても入らない。色は `--cosense-line-number` で変える。

## 名前の衝突を避ける

`toHtml` の既定の class 名は `csn-` で始まる (`.csn-line` / `.csn-title` / `.csn-code` / `.csn-table`)。
CSS フレームワークがページ全体に当てる `.link` / `.table` / `.title` などとは名前がぶつからないので、
フレームワークの見た目は出力に混ざらない。この CSS も全ルールを `.csn-page` の下に書いてあるので、ページ側の要素には当たらない。

ただし、ページ側の CSS が要素名で当てるスタイル (`a { … }` や `table { … }`) は出力にも当たる。
どちらの CSS が勝つかも詳細度で決まる。気になる環境では次のどれかを使う。

- 出力を iframe か Shadow DOM に入れて完全に切り離す
- `toHtml(page, { classNames })` で名前を差し替え、CSS も自分で書く
- この CSS をカスケードレイヤーに入れて、ページ側の CSS を常に優先させる

```css
@import "@cosense-toolbox/style" layer(cosense);
```

## ライセンス

MIT
