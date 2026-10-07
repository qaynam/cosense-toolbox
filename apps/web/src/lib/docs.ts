export interface DocPage {
  href: string
  label: string
  description: string
  keywords: string
}

export interface DocGroup {
  label: string
  pages: DocPage[]
}

export const DOC_GROUPS: DocGroup[] = [
  {
    label: "はじめに",
    pages: [
      {
        href: "/docs/",
        label: "ドキュメント一覧",
        description: "パッケージと目的から、読みたいガイドを探せます。",
        keywords: "全体 概要 はじめ方 パッケージ 選び方",
      },
    ],
  },
  {
    label: "記法とコンパイル",
    pages: [
      {
        href: "/parser/",
        label: "パーサー",
        description: "Cosense 記法を位置情報つきの AST に変換します。",
        keywords: "parser AST parse 構文",
      },
      {
        href: "/parser/demo/",
        label: "パーサーの出力例",
        description: "記法を HTML に変換した結果を確認できます。",
        keywords: "parser toHtml デモ",
      },
      {
        href: "/parser/parse/",
        label: "パース",
        description: "parse、parseLine、tokenizeInline の使い分け。",
        keywords: "parse parseLine tokenizeInline createParser",
      },
      {
        href: "/parser/ast/",
        label: "AST と位置情報",
        description: "ノードの構造とソース上の位置を説明します。",
        keywords: "AST position ノード offset column",
      },
      {
        href: "/parser/utils/",
        label: "AST のヘルパー",
        description: "ノードの検索、収集、リンク抽出に使う関数。",
        keywords: "visit find collect collectLinks firstImage rawTextOf",
      },
      {
        href: "/parser/html/",
        label: "HTML への変換",
        description: "toHast と toHtml の出力・オプション。",
        keywords: "toHast toHtml handlers highlight classNames style",
      },
      {
        href: "/parser/markdown/",
        label: "Markdown への変換",
        description: "toMdast と toMarkdown の出力・オプション。",
        keywords: "toMdast toMarkdown markdown mdast remark",
      },
      {
        href: "/parser/compile/",
        label: "独自形式への変換",
        description: "テキスト化や独自コンパイラーの作り方。",
        keywords: "toPlainText createCompiler",
      },
      {
        href: "/parser/extend/",
        label: "記法の拡張",
        description: "独自の記法や AST ノードを追加します。",
        keywords: "Extension InlineConstruct BracketRule 拡張 schema",
      },
      {
        href: "/parser/media/",
        label: "メディアと埋め込み",
        description: "動画・音声・埋め込み・地図と、サービスの足し方。",
        keywords:
          "video audio embed location YouTube Instagram Apple Music OpenStreetMap 地図 埋め込み",
      },
      {
        href: "/cosense-x/",
        label: "Cosense X",
        description: ".csn / .csnx を JSX モジュールへ変換します。",
        keywords: "cosense-x csnx MDX JSX frontmatter graph fetch",
      },
      {
        href: "/astro/",
        label: "Astro 統合",
        description: ".csn / .csnx を Astro のページや記事に使います。",
        keywords: "astro pages content collection integration",
      },
    ],
  },
  {
    label: "表示とスタイル",
    pages: [
      {
        href: "/style/",
        label: "既定のスタイル",
        description: "パーサーの HTML に適用する CSS とテーマ変数。",
        keywords: "CSS style stylesheet 色 見た目",
      },
      {
        href: "/tailwind/",
        label: "Tailwind CSS",
        description: "Cosense の記法ごとに utility を適用します。",
        keywords: "Tailwind CSS plugin modifier class",
      },
    ],
  },
  {
    label: "エディター連携",
    pages: [
      {
        href: "/lsp/",
        label: "Language Server",
        description: "補完・定義ジャンプ・リンク診断を提供します。",
        keywords: "LSP csn-lsp completion definition diagnostics check",
      },
      {
        href: "/textmate/",
        label: "TextMate 文法",
        description: "Shiki や VS Code で構文を色分けします。",
        keywords: "TextMate Shiki syntax highlighting grammar",
      },
      {
        href: "/vscode/",
        label: "VS Code 拡張",
        description: "Language Server と TextMate 文法をまとめて使えます。",
        keywords: "VS Code vscode extension install settings",
      },
      {
        href: "/zed/",
        label: "Zed 拡張",
        description: "Zed で semantic tokens による色分けを有効にします。",
        keywords: "Zed extension semantic tokens settings",
      },
    ],
  },
  {
    label: "実例と開発",
    pages: [
      {
        href: "/astro-blog/",
        label: "Astro ブログの実例",
        description: "Astro 統合、記事、タグ、リンクグラフのサンプル。",
        keywords: "example blog Astro tutorial demo",
      },
    ],
  },
]

const ALL_DOCS = DOC_GROUPS.flatMap((group) => group.pages)

export const adjacentDocs = (pathname: string): { prev?: DocPage; next?: DocPage } => {
  const index = ALL_DOCS.findIndex((page) => page.href === pathname)
  if (index < 0) return {}
  return { prev: ALL_DOCS[index - 1], next: ALL_DOCS[index + 1] }
}
