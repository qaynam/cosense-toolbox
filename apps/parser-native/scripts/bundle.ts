#!/usr/bin/env bun
/**
 * パーサーを 1 つの JS にまとめ、C のソースに埋め込む。
 *
 *   bun run bundle   → generated/parser.js と generated/parser_js.c
 *
 * effect は使っている部分だけが入る。QuickJS はモジュールの解決をしないので、
 * import の無いスクリプト (iife) にする。C には JS のまま埋め込み、エンジンを作るときに読む
 * (qjsc でバイトコードにすると、iOS や Android へのクロスビルドの途中で、ビルドする機械の
 * qjsc を別に作って動かす手間が増える。読むのはエンジン 1 つにつき 1 度だけなので、JS のままにした)。
 */
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const out = `${root}generated/`

const result = await Bun.build({
  entrypoints: [`${root}src/entry.ts`],
  format: "iife",
  target: "browser",
  minify: true,
})
if (!result.success) {
  console.error(result.logs.join("\n"))
  process.exit(1)
}
const [artifact] = result.outputs
if (artifact === undefined) throw new Error("bun build が何も出さなかった")
const js = new Uint8Array(await artifact.arrayBuffer())

/** 16 バイトずつ改行した、C の配列の中身。 */
const bytesOf = (bytes: Uint8Array): string =>
  Array.from({ length: Math.ceil(bytes.length / 16) }, (_, row) =>
    Array.from(
      bytes.subarray(row * 16, row * 16 + 16),
      (byte) => `0x${byte.toString(16).padStart(2, "0")}`,
    ).join(","),
  ).join(",\n  ")

// QuickJS の JS_Eval は、長さを渡しても終わりの NUL まで読むので、最後に 0 を足す。長さには数えない
const source = `/* bun run bundle が作る。手で書き換えない。 */
#include <stddef.h>

const unsigned char cosense_parser_js[] = {
  ${bytesOf(js)},
  0x00
};

const size_t cosense_parser_js_length = ${js.length};
`

await mkdir(out, { recursive: true })
await writeFile(`${out}parser.js`, js)
await writeFile(`${out}parser_js.c`, source)
console.log(`generated/parser.js (${js.length} バイト) と generated/parser_js.c を書いた`)
