// @ts-check
import svelte from '@astrojs/svelte'
import cosense from '@cosense-toolbox/astro'
import { customDecorations } from '@cosense-toolbox/parser/extensions'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { pageUrl, tagUrl } from './src/urls.ts'

try {
  process.loadEnvFile()
} catch {}

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
  integrations: [
    svelte(),
    cosense({
      components: './src/components/cosense.ts',
      pageUrl,
      tagUrl,
      parseOptions: {
        extensions: [
          customDecorations(['|', '!', '~', '#'])
        ],
        tableCellNotation: "all",
      },
      tableCellLineBreakMarker: "\\n",
      unresolved: 'warn',
      assets: { pat: process.env.COSENSE_PAT },
    }),
  ],
})
