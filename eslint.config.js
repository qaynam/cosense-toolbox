/**
 * リポジトリ全体の lint の設定。整形は prettier に任せ、ここでは書き方の誤りだけを見る。
 * 規則は、それまで使っていた Biome の設定 (recommended + 型の import を分ける + import を並べる) を引き継ぐ。
 */
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import astro from 'eslint-plugin-astro'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/.turbo/**',
      '**/.wrangler/**',
      '**/public/**',
      // 生成したファイル。作り直すたびに差分が出ないよう、手を入れない。
      '**/*.generated.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      // 型だけに使う import は `import type` / `type` を付けて分ける。verbatimModuleSyntax で JS に残らないようにするため。
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // localStorage のように、使えなければ諦めてよい処理の catch は空にしてよい。
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 使わない引数は `_` で始めて明示する (`(output, _node, ctx) => …` のような拡張の関数)。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  // 整形に関わる規則は prettier とぶつかるので切る。最後に置く。
  svelte.configs.prettier,
  prettier,
)
