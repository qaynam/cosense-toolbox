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

- **破壊的変更:** `@cosense-toolbox/parser` 1.0.0 が既定の class 名の一部を Cosense Web のエディタと同じ名前にしたので、ルールのセレクタを合わせた (下の表)。
  CSS 変数 (`--cosense-*`) の名前は変わらない。
  - **移行:** parser も 1.0.0 にそろえる。parser の 0.1.0-beta の出力 (`.link` の内部リンク、`.table`、`.title`) には当たらなくなる。
    このスタイルを上書きするために自分で書いていたセレクタも、表のとおりに書き換える。
    タイトルにも Cosense Web と同じく `.line` が付くので、行だけに当てるセレクタは `.line:not(.line-title)` と書く。
- class 名に `csn-` を付けた `csn.css` を足した (`@cosense-toolbox/style/csn.css`)。
  parser の `toHtml` に `classPrefix: "csn-"` を渡したときに、この CSS の代わりに読み込む ([名前の衝突を避ける](#名前の衝突を避ける))。
- 字下げして書いた表 (`table:名前`) を、同じ深さの行の本文と同じ位置に置くようにした。
  `@cosense-toolbox/parser` 1.0.0 の `toHtml` が表に付ける `data-indent` を見るので、parser も 1.0.0 にそろえる。

セレクタに使う class 名のうち、変わったものの今までと 1.0.0 の対応:

| 今まで                            | 1.0.0                  |
| :-------------------------------- | :--------------------- |
| `.title`                          | `.line-title`          |
| `.monospace`                      | `.cli`                 |
| `.table`                          | `.table-block`         |
| `.decoration`                     | `.deco`                |
| `.link` / `.hashtag` (リンクの色) | `.page-link` / `.link` |

## 前提

すべてのルールが `.page` の下にスコープされている。`toHtml(page)` の出力はルートに `.page` を持つので
そのまま当たるが、`parseLine` の 1 行だけを描画する場合は自分で `.page` で包む。

```html
<div class="page">{toHtml(parseLine('[* 太字]'))}</div>
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

`.page` は font-family / font-size / line-height を明示している。これを外すと
埋め込み先のページからフォントが降ってきて表示が崩れるため。
既定値は本体のページ本文と同じ **15px / 28px**（body の 14px ではなくエディタ側の値）で、
見出しやコードなど em で書いた寸法はすべてこの基準に乗る。
`--cosense-font-size` を変えれば全体が拡縮する。

アイコンは Cosense Web と同じ `a.link.icon > img.icon` の入れ子。`toHtml` に `iconImageUrl` を渡していないときは
`<img>` が無く、ユーザー名のテキストリンクとして出る。

## インデントの中点

Cosense と同じく、字下げの右端に中点を出す。`toHtml` の既定の出力には中点にあたる要素が
無いので `.line[data-indent]::before` で描いている。

`toHtml(page, { showPads: true })` で Cosense Web と同じ形の `.indent-mark` / `.pad` / `.dot` を
書き出した場合は、擬似要素を止めて要素側のスタイルを使う。どちらでも見た目は同じ。

## コードブロックの行番号

`@cosense-toolbox/parser/html` の `codeLineNumbers()` を描画の拡張 (`extensions`) に渡すと、本体行に `data-line` と `data-line-digits` が付き、このスタイルが行の左に番号の欄を取って番号を出す。
欄の幅はブロックの最後の番号の桁数で決まる。番号は選択の対象にならないので、コードをコピーしても入らない。色は `--cosense-line-number` で変える。

## 名前の衝突を避ける

`toHtml` の既定の class 名は Cosense Web のエディタと同じ (`.line` / `.page-link` / `.table-block` など)。
この CSS は全ルールを `.page` の下に書いてあるので、ページ側の要素には当たらない。

逆に、CSS フレームワークがページ全体に当てる class (DaisyUI の `.link` など) は、同じ名前を持つ出力の要素にも当たる。
そのときは `toHtml` に `classPrefix: "csn-"` を渡し、この CSS の代わりに `csn.css` を読み込む。
`csn.css` は、この CSS の class 名すべてに `csn-` を付けたもの。装飾の記号ごとの `deco-*` には、`toHtml` と同じく付けない。

```ts
import "@cosense-toolbox/style/csn.css"

toHtml(page, { classPrefix: "csn-" }) // → '<div class="csn-page"><h1 class="csn-line csn-line-title">…'
```

`csn-` 以外の接頭辞を使うときは、[`@cosense-toolbox/tailwind`](../tailwind) の `prefix` を使うか、CSS を自分で書く。

ページ側の CSS が要素名で当てるスタイル (`a { … }` や `table { … }`) は、どちらの CSS でも出力に当たる。
どちらの CSS が勝つかも詳細度で決まる。気になる環境では次のどれかを使う。

- 出力を iframe か Shadow DOM に入れて完全に切り離す
- `toHtml(page, { classNames })` で名前を差し替え、CSS も自分で書く
- この CSS をカスケードレイヤーに入れて、ページ側の CSS を常に優先させる

```css
@import "@cosense-toolbox/style" layer(cosense);
```

## 開発

スタイルの正は `style.css`。`csn.css` は、そこから機械的に作ったもの。

```sh
bun run generate   # style.css を直したら csn.css を作り直す
bun run test       # 作り直し忘れもここで落ちる
```

## ライセンス

MIT
