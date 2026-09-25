/**
 * リポジトリ全体の整形の設定。
 * 書き方は、それまで packages/ で使っていた Biome の設定 (シングルクォート・セミコロンなし・100 桁) を引き継ぐ。
 *
 * @type {import('prettier').Config}
 */
export default {
  printWidth: 100,
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-astro', 'prettier-plugin-svelte'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
}
