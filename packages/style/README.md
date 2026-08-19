# @cosense-toolbox/style

> **beta.** class 名はまだ変わりえます。安定するまではバージョン固定での利用を推奨します。

[`@cosense-toolbox/parser`](../parser) の `toHtml` が出す HTML に当てる既定のスタイルシート。
CSS 1 枚だけのパッケージなので、スタイルが要らないなら入れなくてよい。

```sh
npm i @cosense-toolbox/style@beta
```

```ts
import '@cosense-toolbox/style'
```

> ⚠️ これは Cosense (Scrapbox) 本体の CSS **ではありません**。本体の CSS はエディタの DOM
> (`.line > .text > 1 文字ごとの .char-index`) に当てたもので `toHtml` の出力には当たらないため、
> 見た目を寄せた別実装として書き起こしたものです。

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

| 変数 | 既定 | 本体テーマの変数 |
|---|---|---|
| `--cosense-text` | `#4a4a4a` | `--page-text-color` |
| `--cosense-title` | 本文と同じ | `--line-title-color` |
| `--cosense-bg` | `#fefefe` | `--page-bg` |
| `--cosense-link` | `#3d72f5` | `--page-link-color` |
| `--cosense-link-hover` | `#0d4ff3` | `--page-link-hover-color` |
| `--cosense-code-text` | `#342d9c` | `--code-color` |
| `--cosense-code-bg` | `rgba(0,0,0,.04)` | `--code-bg` |
| `--cosense-quote-bg` | `rgba(0,0,0,.05)` | `--quote-bg-color` |
| `--cosense-badge-text` / `--cosense-badge-bg` | `#342d9c` / `#ffcfc6` | — |
| `--cosense-font` | `"Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif` | — |
| `--cosense-font-size` | `15px` | — |
| `--cosense-line-height` | `1.87` | — |
| `--cosense-code-font` | `ui-monospace, …` | — |
| `--cosense-indent` | `1.5em` | — |

「本体テーマの変数」の列は fallback として参照している。Cosense のテーマ変数を持つページに
埋め込めば、`--cosense-*` を書かなくても見た目が揃う。

`.page` は font-family / font-size / line-height を明示している。これを外すと
埋め込み先のページからフォントが降ってきて表示が崩れるため。
既定値は本体のページ本文と同じ **15px / 28px**（body の 14px ではなくエディタ側の値）で、
見出しやコードなど em で書いた寸法はすべてこの基準に乗る。
`--cosense-font-size` を変えれば全体が拡縮する。

アイコンは `a.icon > img.icon` の入れ子。`toHtml` に `iconImageUrl` を渡していないときは
`<img>` が無く、ユーザー名のテキストリンクとして出る。

## インデントの中点

Cosense と同じく、字下げの右端に中点を出す。`toHtml` の既定の出力には中点にあたる要素が
無いので `.line[data-indent]::before` で描いている。

`toHtml(page, { showPads: true })` で本家と同じ `.indent-mark` / `.pad` / `.dot` を
書き出した場合は、擬似要素を止めて要素側のスタイルを使う。どちらでも見た目は同じ。

## 名前の衝突を避ける

`toHtml` の既定の class 名は接頭辞を持たない (`.line` / `.title` / `.code` / `.table`)。
この CSS は全ルールを `.page` の下にスコープしてあるので外には漏れないが、
**ページ側にも `.page` がある場合は競合する**。気になる環境では次のどれかを使う。

- 出力を iframe か Shadow DOM に入れて完全に切り離す
- `toHtml(page, { classNames })` で名前を差し替え、CSS も自分で書く
- この CSS をカスケードレイヤーに入れて、ページ側の CSS を常に優先させる

```css
@import '@cosense-toolbox/style' layer(cosense);
```

## ライセンス

MIT
