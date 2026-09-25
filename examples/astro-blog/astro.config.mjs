// @ts-check
import svelte from '@astrojs/svelte'
import cosense from '@cosense-toolbox/astro'
import { codeLineNumbers } from '@cosense-toolbox/parser/compile'
import { customDecorations } from '@cosense-toolbox/parser/extensions'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { pageUrl, tagUrl } from './src/urls.ts'

try {
  process.loadEnvFile()
} catch {}

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
  markdown: { shikiConfig: { theme: 'catppuccin-latte' } },
  integrations: [
    svelte(),
    cosense({
      components: './src/components/cosense.ts',
      pageUrl,
      tagUrl,
      parseOptions: {
        extensions: [customDecorations(['|', '!', '~', '#'])],
      },
      unresolved: 'warn',
      // 描画の設定。parser の toHast に渡る。行番号 (data-line) を付け、表示は @cosense-toolbox/tailwind が持つ。
      renderOptions: { extensions: [codeLineNumbers()] },
      assets: { pat: process.env.COSENSE_PAT },
    }),
  ],
})
