/**
 * modifiers.ts — `cosense-link:underline` のように、記事の中の特定の要素にだけ utility を当てる modifier。
 * typography の `prose-a:` にあたる。
 *
 * 対象は HTML の要素名ではなく Cosense の記法で選ぶ。`toHtml` は同じ `<a>` をリンク・タグ・
 * アイコンに使い分けるので、要素名で選ぶと区別できないため。class 名は parser の既定
 * (`defaultClassNames`) に合わせている。
 */

export interface Modifier {
  /** modifier の名前。`{className}-{name}:` になる */
  readonly name: string
  /** 当てる先のセレクタ。`.cosense` の子孫として探す */
  readonly target: string
  /** 対応する Cosense の記法 (README の表に出す) */
  readonly notation: string
}

export const MODIFIERS: readonly Modifier[] = [
  { name: "title", target: ".title", notation: "タイトル (1 行目)" },
  { name: "line", target: ".line", notation: "各行" },
  {
    name: "heading",
    target: ".decoration[data-size-level]",
    notation: "`[** 見出し]` などの大きな文字",
  },
  { name: "strong", target: "strong", notation: "`[[太字]]` `[* 太字]`" },
  { name: "em", target: "em", notation: "`[/ 斜体]`" },
  { name: "s", target: "s", notation: "`[- 打ち消し]`" },
  { name: "u", target: "u", notation: "`[_ 下線]`" },
  {
    name: "link",
    target: ".link",
    notation: "リンクすべて (`[ページ]` `[https://…]` `[/project/ページ]`)",
  },
  { name: "link-external", target: ".link-external", notation: "外部リンク `[https://…]`" },
  {
    name: "link-project",
    target: ".link-project",
    notation: "別プロジェクトへのリンク `[/project/ページ]`",
  },
  { name: "hashtag", target: ".hashtag", notation: "`#タグ`" },
  { name: "code", target: ".code", notation: "`` `コード` ``" },
  {
    name: "code-block",
    target: ".code-block > code",
    notation: "`code:ファイル名` のブロックの各行",
  },
  {
    name: "code-filename",
    target: ".code-block-start",
    notation: "`code:ファイル名` のファイル名",
  },
  { name: "quote", target: ".quote", notation: "`>` で始まる引用" },
  { name: "table", target: ".table", notation: "`table:名前` の表" },
  { name: "td", target: ".table td", notation: "表のセル" },
  { name: "image", target: ".image", notation: "画像" },
  { name: "icon", target: ".icon", notation: "`[ユーザー名.icon]`" },
  { name: "formula", target: ".formula", notation: "`[$ 数式]`" },
]
