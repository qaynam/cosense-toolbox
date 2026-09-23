# @cosense-toolbox/tailwind

Tailwind CSS のプラグイン。`class="cosense"` を付けた要素の中に、Cosense (旧 Scrapbox) の記法を描画した HTML の既定の見た目を当てる。
typography プラグインの `prose` と同じ使い方をする。

当てるスタイルは [`@cosense-toolbox/style`](../style) と同じもの。
Tailwind を使っているなら、style.css を別に読み込まなくてよい。

> **beta**：class 名や出力はまだ変わりうる。

## 使い方

Tailwind v4 の CSS に `@plugin` で足す。

```css
@import "tailwindcss";
@plugin "@cosense-toolbox/tailwind";
```

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

## 一部だけ外す

`not-cosense` を付けた要素とその中身には当てない。`.csnx` に埋め込んだコンポーネントを、ページの見た目から切り離したいときに使う。

```svelte
<aside class="not-cosense">…</aside>
```

## 色や寸法を変える

style.css と同じ CSS 変数で変える。変数の一覧は [`@cosense-toolbox/style` の README](../style/README.md#色を変える) にある。

```html
<article class="cosense [--cosense-link:var(--color-blue-700)] [--cosense-font-size:16px]">
```

## オプション

```css
@plugin "@cosense-toolbox/tailwind" {
  className: article;
}
```

| オプション | 既定 | 内容 |
| :--- | :--- | :--- |
| `className` | `cosense` | スタイルを当てる class 名。除外の class 名は `not-{className}` になる |

## style.css との違い

- style.css の `.page` を `.cosense` に置き換えている。ほかのセレクタと宣言はすべて同じ
- 各ルールに `:not(:where([class~="not-cosense"], [class~="not-cosense"] *))` が付く。`:where()` の中なので詳細度は増えない
- typography と違い、ルール全体を `:where()` で包んで詳細度を 0 にはしていない。style.css には、詳細度の大小で勝ち負けが決まるルールがあるため、その関係をそのまま保っている

## 開発

スタイルの正は `packages/style/style.css`。このパッケージの `src/styles.generated.ts` は、そこから機械的に作ったもの。

```sh
bun run generate   # style.css を直したら作り直す
bun run test       # 作り直し忘れもここで落ちる
```

## ライセンス

MIT。
