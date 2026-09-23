// @ts-check
import svelte from '@astrojs/svelte'
import cosense from '@cosense-toolbox/astro'
import { defineConfig } from 'astro/config'
import { pageUrl, tagUrl } from './src/urls.ts'

export default defineConfig({
  integrations: [
    svelte(),
    cosense({
      components: './src/components/cosense.ts',
      pageUrl,
      tagUrl,
      // 書いている最中にリンク切れをビルドログで拾う。
      unresolved: 'warn',
    }),
  ],
})
