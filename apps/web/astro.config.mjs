// @ts-check
import cosense from "@cosense-toolbox/astro"
import { cosense as cosenseGrammar, cosenseX as cosenseXGrammar } from "@cosense-toolbox/textmate"
import { defineConfig } from "astro/config"

import { codeLanguage } from "./src/lib/code-language.ts"

const SITE_URL = process.env.SITE_URL ?? "https://cosense-toolbox.qaynam.dev"

export default defineConfig({
  site: SITE_URL,
  // サイトのライト/ダークの切り替えに合わせて色を選べるよう、両方の色を CSS 変数で出す (global.css)。
  // 既定の github-dark や github-light は、コメントなどの色が背景に対して薄すぎる。
  markdown: {
    shikiConfig: {
      themes: { light: "github-light-default", dark: "github-dark-default" },
      defaultColor: false,
      // ドキュメントの中の Cosense 記法の例 (code:csnx など) も色付けする
      langs: [cosenseGrammar, cosenseXGrammar],
    },
  },
  integrations: [
    cosense({
      components: "./src/components/cosense-docs.ts",
      assets: false,
      // コードブロックの見出しに言語のアイコンと名前を出す
      renderOptions: { extensions: [codeLanguage()] },
      // [ページのタイトル] を、そのページの URL へのリンクにする。URL は src/pages の中の場所で決まる
      pageUrl: ({ id }) =>
        `/${(id ?? "").replace(/^src\/pages\//, "").replace(/(?:\/?index)?\.csnx?$/, "")}/`.replace(
          /^\/\/$/,
          "/",
        ),
      // タイトルを書き間違えたリンクは、リンクにならずに素の文字になるので、ビルドで止める
      lint: { unresolvedLinks: "error" },
    }),
  ],
})
