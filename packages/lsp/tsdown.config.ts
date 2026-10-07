import { defineConfig } from "tsdown"

export default defineConfig({
  // Each subpath is a file of src/public/, which hands out plain values in place of effect's
  // types. The bin (`main`) is not imported by anyone, so it is the module itself.
  entry: {
    main: "src/main.ts",
    tokens: "src/public/tokens.ts",
    completion: "src/public/completion.ts",
    link: "src/public/link.ts",
    media: "src/public/media.ts",
    suggest: "src/public/suggest.ts",
    check: "src/public/check.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
})
