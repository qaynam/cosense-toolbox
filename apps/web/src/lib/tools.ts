export interface Tool {
  href: string
  title: string
  /** カードに出る説明。1〜2 行に収める */
  description: string
  /** カードの下に小さく出す補足 */
  note?: string
  /** カードの角に出す字形 */
  icon: string
  /** アイコンの色。実際の値は global.css の [data-accent] が持つ */
  accent: "blue" | "orange"
}

/**
 * トップに並べる道具。ここが並び順とラベルの単一情報源になる。
 * 道具を足すときは、対応するページを src/pages/ に作ってからここへ登録する。
 */
export const TOOLS: Tool[] = [
  {
    href: "/parser/",
    title: "記法パーサー",
    description:
      "Cosense の記法を、位置情報つきの AST に変換する npm パッケージ。HTML やテキストにも変換できる。",
    note: "@cosense-toolbox/parser",
    icon: "{ }",
    accent: "blue",
  },
  {
    href: "/builder/",
    title: "テーマ作成",
    description: "色を変えながら疑似 Cosense 画面で確かめて、userCSS を書き出す。",
    icon: "◐",
    accent: "orange",
  },
]
