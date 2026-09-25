/**
 * リポジトリ全体の整形の設定。
 * セミコロンなし・100 桁は、それまで packages/ で使っていた Biome の設定を引き継ぐ。
 * 引用符は、打ちやすいダブルクォートにする。
 *
 * @type {import('prettier').Config}
 */
export default {
  printWidth: 100,
  tabWidth: 2,
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  plugins: ["prettier-plugin-astro", "prettier-plugin-svelte"],
  overrides: [{ files: "*.astro", options: { parser: "astro" } }],
}
