import { defineConfig, type UserConfig } from "tsdown"

const shared = {
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  deps: { neverBundle: [/^tailwindcss(\/|$)/] },
} satisfies UserConfig

/**
 * Tailwind v4 は `@plugin` で ESM として読む。`@config` で読む JavaScript の設定ファイルの `plugins` に
 * `require` で書く利用者もいるので、CJS も出す。
 *
 * CJS は `require` がプラグインそのものを返す `module.exports = cosense` になる。型をそれにそろえて
 * `export =` にするため、CJS は default だけを出す入口から作る。tsdown が型を `export =` にするのは、
 * 入口が default のほかに何も出さないときだけで、`CosenseTailwindOptions` を一緒に出す ESM の入口から作ると
 * 型だけが `export { cosense as default }` になる。
 */
export default defineConfig([
  { ...shared, entry: { index: "src/index.ts" }, format: "esm" },
  { ...shared, entry: { index: "src/require.ts" }, format: "cjs" },
])
