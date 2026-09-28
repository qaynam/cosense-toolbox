import { defineConfig } from "tsdown"

export default defineConfig([
  // The extension itself, loaded by VS Code as CommonJS. `vscode` is VS Code's own; the
  // language client is bundled, so the extension needs no node_modules of its own.
  {
    entry: { extension: "src/extension.ts" },
    format: ["cjs"],
    platform: "node",
    target: "node20",
    fixedExtension: true,
    external: ["vscode"],
    noExternal: [/^(?!vscode$)/],
    dts: false,
    sourcemap: true,
    clean: true,
  },
  // The language server, bundled with everything it needs so the extension runs it as is.
  {
    entry: { server: "../../packages/lsp/dist/main.mjs" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    fixedExtension: true,
    noExternal: [/.*/],
    dts: false,
    sourcemap: false,
    clean: false,
  },
])
