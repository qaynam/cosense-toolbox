import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    schema: "src/schema.ts",
    utils: "src/utils/index.ts",
    extensions: "src/extensions/index.ts",
    compile: "src/compile/index.ts",
    html: "src/html/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
})
