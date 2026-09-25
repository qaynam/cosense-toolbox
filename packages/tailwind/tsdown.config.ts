import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  // Tailwind v4 は ESM で読むが、v3 系の設定ファイルなど require で読む利用者もいるので両方出す。
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  deps: { neverBundle: [/^tailwindcss(\/|$)/] },
})
