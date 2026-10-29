// @ts-check
import cosense from "@cosense-toolbox/astro"
import { cosense as cosenseGrammar, cosenseX as cosenseXGrammar } from "@cosense-toolbox/textmate"
import { defineConfig } from "astro/config"

import { codeLanguage } from "./src/lib/code-language.ts"
import { embed, extraEmbeds, location } from "./src/lib/embed.ts"

const SITE_URL = process.env.SITE_URL ?? "https://cosense-toolbox.qaynam.dev"

export default defineConfig({
  site: SITE_URL,
  markdown: {
    shikiConfig: {
      themes: { light: "github-light-default", dark: "github-dark-default" },
      defaultColor: false,
      langs: [cosenseGrammar, cosenseXGrammar],
    },
  },
  integrations: [
    cosense({
      components: "./src/components/cosense-docs.ts",
      assets: false,
      parseOptions: { extensions: [extraEmbeds()] },
      renderOptions: { extensions: [codeLanguage()], handlers: { embed, location } },
      pageUrl: ({ id }) =>
        `/${(id ?? "").replace(/^src\/pages\//, "").replace(/(?:\/?index)?\.csnx?$/, "")}/`.replace(
          /^\/\/$/,
          "/",
        ),
      lint: { unresolvedLinks: "error" },
    }),
  ],
})
