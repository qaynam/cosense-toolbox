import { defineConfig } from "tsdown"

export default defineConfig({
  // 入口は src/public/ に置く。index は素の型と Promise で、effect は effect の型のまま出す。
  entry: {
    index: "src/public/index.ts",
    effect: "src/public/effect.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
})
