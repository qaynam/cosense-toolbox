import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  // 利用側のプロジェクトにあるものを使う。型定義にも取り込まない。
  deps: { neverBundle: [/^astro(\/|$)/, /^@cosense-toolbox\//, /^vite(\/|$)/] },
})
