import { defineConfig } from "tsdown"

export default defineConfig({
  // index は素の型と Promise で出し、effect は effect の型のまま出す。
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
