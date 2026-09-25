// @ts-check
import svelte from '@astrojs/svelte'
import cosense from '@cosense-toolbox/astro'
import { customDecorations, tableCellNotation } from '@cosense-toolbox/parser/extensions'
import { codeLineNumbers, tableCellLineBreaks } from '@cosense-toolbox/parser/html'
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
      // パースの設定。表のセルの中でも、行と同じく記法を読む。
      parseOptions: {
        extensions: [customDecorations(['|', '!', '~', '#']), tableCellNotation()],
      },
      unresolved: 'warn',
      // 描画の設定。parser の toHast に渡る。行番号 (data-line) を付け、表示は @cosense-toolbox/tailwind が持つ。
      // 表のセルの中の \n は改行にする。
      renderOptions: { extensions: [codeLineNumbers(), tableCellLineBreaks('\\n')] },
      assets: { pat: process.env.COSENSE_PAT },
    }),
  ],
})
