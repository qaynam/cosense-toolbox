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
  { name: "title", target: ".line-title", notation: "タイトル (1 行目)" },
  // タイトルにも Cosense Web と同じく line が付くので、タイトルは除く。
  { name: "line", target: ".line:not(.line-title)", notation: "タイトルを除く各行" },
  {
    name: "heading",
    target: ".deco[data-size-level]",
    notation: "`[** 見出し]` などの大きな文字",
  },
  { name: "strong", target: "strong", notation: "`[[太字]]` `[* 太字]`" },
  { name: "em", target: "em", notation: "`[/ 斜体]`" },
  { name: "s", target: "s", notation: "`[- 打ち消し]`" },
  { name: "u", target: "u", notation: "`[_ 下線]`" },
  {
    name: "link",
    // 内部リンクは page-link、外部リンク・アイコン・地図は link (どちらも Cosense Web と同じ名前)。
    target: ".page-link, .link",
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
  { name: "table", target: ".table-block", notation: "`table:名前` の表" },
  { name: "td", target: ".table-block td", notation: "表のセル" },
  { name: "image", target: ".image", notation: "画像" },
  { name: "video", target: ".video", notation: "動画" },
  { name: "audio", target: ".audio", notation: "音声" },
  { name: "embed", target: ".embed", notation: "YouTube などの埋め込み" },
  { name: "location", target: ".link-location", notation: "地図 `[N35,E139]`" },
  // アイコンは画像を包むリンクにも同じ class が付くので、画像だけを選ぶ。リンクも選ぶと utility が 2 重に効く。
  { name: "icon", target: "img.icon", notation: "`[ユーザー名.icon]`" },
  { name: "formula", target: ".formula", notation: "`[$ 数式]`" },
]
