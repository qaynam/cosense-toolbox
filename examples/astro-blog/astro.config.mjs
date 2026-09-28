// @ts-check
import svelte from "@astrojs/svelte"
import cosense from "@cosense-toolbox/astro"
import { customDecorations, tableCellNotation } from "@cosense-toolbox/parser/extensions"
import { codeLineNumbers, tableCellLineBreaks } from "@cosense-toolbox/parser/html"
import { cosense as cosenseGrammar, cosenseX as cosenseXGrammar } from "@cosense-toolbox/textmate"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

import { pageUrl, tagUrl } from "./src/urls.ts"

try {
  process.loadEnvFile()
} catch {}

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
  markdown: {
    shikiConfig: {
      theme: "catppuccin-latte",
      langs: [cosenseGrammar, cosenseXGrammar],
    },
  },
  integrations: [
    svelte(),
    cosense({
      components: "./src/components/cosense.ts",
      pageUrl,
      tagUrl,
      parseOptions: {
        extensions: [customDecorations(["|", "!", "~", "#"]), tableCellNotation()],
      },
      renderOptions: { extensions: [codeLineNumbers(), tableCellLineBreaks("\\n")] },
      assets: { pat: process.env.COSENSE_PAT },
    }),
  ],
})
