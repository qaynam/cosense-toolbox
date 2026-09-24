// @ts-check
import svelte from '@astrojs/svelte'
import cosense from '@cosense-toolbox/astro'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { pageUrl, tagUrl } from './src/urls.ts'

// Astro は設定ファイルの中では .env を読まないので、COSENSE_PAT を読むためにここで読む。
try {
  process.loadEnvFile()
} catch {
  // .env が無ければ公開プロジェクトとして扱う。
}

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
  integrations: [
    svelte(),
    cosense({
      components: './src/components/cosense.ts',
      pageUrl,
      tagUrl,
      // 書いている最中にリンク切れをビルドログで拾う。
      unresolved: 'warn',
      // Cosense 上の画像とアイコンは、ビルド時に取ってきて dist/_cosense/ に置く (既定で有効)。
      // 非公開プロジェクトの画像を取るときは PAT を渡す。
      assets: { pat: process.env.COSENSE_PAT },
    }),
  ],
})
