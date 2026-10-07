#!/usr/bin/env bun
/**
 * C のライブラリ (QuickJS の中のパーサー) が、Bun で動かしたパーサーと一字一句同じ JSON を返すか。
 *
 *   bun run compare [cosense_parser_cli のパス]
 *
 * 入力はパーサーの記法仕様 (conformance.json) のすべてと、位置の数え方が分かれやすい行。
 * パスを渡さなければ build/cosense_parser_cli を使う。
 */
import { fileURLToPath } from "node:url"

import { parse, parseLine } from "@cosense-toolbox/parser"

import conformance from "../../../packages/parser/src/fixtures/conformance.json" with { type: "json" }

const root = fileURLToPath(new URL("..", import.meta.url))
const cli = Bun.argv[2] ?? `${root}build/cosense_parser_cli`

/** UTF-16 で 2 つ分の字、結合文字、タブなど、位置の数え方が分かれやすい行 */
const tricky = [
  "😀[設計メモ] #タグ 👨‍👩‍👧 [https://example.com 例]",
  "\t[* 太字の中の[リンク]]",
  "が゙ぎ [$ x^2 $] `コード` [N35.68,E139.76,Z14 東京駅]",
  "",
]

const lines = [
  ...conformance.inline.map(({ input }) => input),
  ...conformance.tableCell.map(({ input }) => input),
  ...tricky,
]
const pages = [...conformance.page.map(({ input }) => input), tricky.join("\n")]

/** `inputs` をそれぞれ NUL で終えて渡し、1 行ずつの JSON を受け取る */
const native = async (mode: "line" | "page", inputs: ReadonlyArray<string>) => {
  const started = performance.now()
  const child = Bun.spawn([cli, mode], { stdin: "pipe", stdout: "pipe", stderr: "inherit" })
  child.stdin.write(inputs.map((input) => `${input}\0`).join(""))
  await child.stdin.end()
  const output = await new Response(child.stdout).text()
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`${cli} ${mode} が ${exitCode} で終わった`)
  return { results: output.split("\n").slice(0, inputs.length), ms: performance.now() - started }
}

const mismatches = async (
  mode: "line" | "page",
  inputs: ReadonlyArray<string>,
  expected: (input: string) => string,
) => {
  const { results, ms } = await native(mode, inputs)
  console.log(`${mode}: ${inputs.length} 件を ${ms.toFixed(1)}ms (エンジンを作る時間を含む)`)
  return inputs.flatMap((input, index) =>
    results[index] === expected(input) ? [] : [{ mode, input, native: results[index] }],
  )
}

const found = [
  ...(await mismatches("line", lines, (input) => JSON.stringify(parseLine(input)))),
  ...(await mismatches("page", pages, (input) => JSON.stringify(parse(input)))),
]

if (found.length > 0) {
  for (const { mode, input, native: result } of found) {
    console.error(`違う (${mode}): ${JSON.stringify(input)}\n  C: ${result?.slice(0, 200)}`)
  }
  process.exit(1)
}
console.log(`${lines.length + pages.length} 件すべて、Bun で動かしたパーサーと同じ JSON だった`)
