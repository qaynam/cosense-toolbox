export interface Tool {
  href: string
  title: string
  /** カードに出る説明。1〜2 行に収める */
  description: string
  /** カードの下に小さく出す補足。パッケージならその名前 */
  note?: string
  /** カードの角に出す字形 */
  icon: string
  /** アイコンの色。実際の値は global.css の [data-accent] が持つ */
  accent: "blue" | "orange" | "green" | "purple"
}

export interface ToolGroup {
  /** 見出し。ページ内のリンクにも使うので、グループの中で重ならない id を持つ */
  id: string
  label: string
  tools: Tool[]
}

/**
 * トップに並べる道具。ここが並び順とラベルの単一情報源になる。
 * 道具を足すときは、対応するページを src/pages/ に作ってからここへ登録する。
 */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "libraries",
    label: "ライブラリ",
    tools: [
      {
        href: "/parser/",
        title: "パーサー",
        description: "Cosense 記法を位置情報つきの AST にして、HTML や独自の形式に変換する。",
        note: "@cosense-toolbox/parser",
        icon: "{ }",
        accent: "blue",
      },
      {
        href: "/cosense-x/",
        title: "Cosense X",
        description: ".csn / .csnx のページを JSX モジュールにコンパイルする。",
        note: "@cosense-toolbox/cosense-x",
        icon: "X",
        accent: "blue",
      },
      {
        href: "/astro/",
        title: "Astro 統合",
        description: ".csn / .csnx を Astro のページと content collection にする。",
        note: "@cosense-toolbox/astro",
        icon: "A",
        accent: "blue",
      },
      {
        href: "/style/",
        title: "既定のスタイル",
        description: "描画した HTML に、Cosense らしい見た目を当てる CSS。",
        note: "@cosense-toolbox/style",
        icon: "✦",
        accent: "purple",
      },
      {
        href: "/tailwind/",
        title: "Tailwind CSS",
        description: "同じ見た目を Tailwind CSS から使い、記法ごとに上書きする。",
        note: "@cosense-toolbox/tailwind",
        icon: "~",
        accent: "purple",
      },
    ],
  },
  {
    id: "editors",
    label: "エディター連携",
    tools: [
      {
        href: "/lsp/",
        title: "Language Server",
        description: "補完、定義ジャンプ、リンク切れの診断。CI でのチェックにも使える。",
        note: "@cosense-toolbox/lsp",
        icon: "⌘",
        accent: "green",
      },
      {
        href: "/textmate/",
        title: "TextMate 文法",
        description: "Shiki や VS Code で .csn / .csnx を色付けする。",
        note: "@cosense-toolbox/textmate",
        icon: "Tm",
        accent: "green",
      },
      {
        href: "/vscode/",
        title: "VS Code 拡張",
        description: "色付けと Language Server を VS Code で使う。",
        note: "apps/vscode-cosense",
        icon: "VS",
        accent: "green",
      },
      {
        href: "/zed/",
        title: "Zed 拡張",
        description: "色付けと Language Server を Zed で使う。",
        note: "apps/zed-cosense",
        icon: "Z",
        accent: "green",
      },
    ],
  },
  {
    id: "tools",
    label: "道具",
    tools: [
      {
        href: "/builder/",
        title: "テーマ作成",
        description: "色を変えながら疑似 Cosense 画面で確かめて、userCSS を書き出す。",
        icon: "◐",
        accent: "orange",
      },
      {
        href: "/icon/",
        title: "アイコン作成",
        description: "文字と記号でバッジを作り、[名前.icon] で使う画像を書き出す。",
        icon: "✓",
        accent: "orange",
      },
    ],
  },
]
