/**
 * トップに並べる道具の一覧。ここが並び順とラベルの単一情報源になる。
 * 道具を足したら、対応するページを src/pages/ に作ってからここへ登録する。
 */
export interface Tool {
  id: string;
  href: string;
  title: string;
  /** カードに出る 1〜2 行の説明 */
  description: string;
  /** カードの下に出す補足。件数や状態など */
  note?: string;
  icon: string;
}

export const TOOLS: Tool[] = [
  {
    id: "parser",
    href: "/parser/",
    title: "記法パーサー",
    description:
      "Cosense の記法を、位置情報つきの AST に変換する npm パッケージ。HTML やテキストにも変換できる。",
    note: "@cosense-toolbox/parser",
    icon: "{ }",
  },
  {
    id: "builder",
    href: "/builder/",
    title: "テーマ作成",
    description:
      "色を変えながら疑似 Cosense 画面で確かめて、userCSS を書き出す。",
    icon: "◐",
  },
];
