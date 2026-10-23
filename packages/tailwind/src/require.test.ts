import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"

import { build } from "tsdown"
import ts from "typescript"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const PACKAGE_DIR = join(import.meta.dirname, "..")

/**
 * 公開するのと同じ設定でビルドした出力の置き場所。出力の型が `tailwindcss/plugin` を import するので、
 * それを解決できるよう、パッケージの node_modules の下に置く。
 */
let outDir = ""

beforeAll(async () => {
  const cache = join(PACKAGE_DIR, "node_modules", ".cache")
  await mkdir(cache, { recursive: true })
  outDir = await mkdtemp(join(cache, "require-test-"))
  await build({
    config: join(PACKAGE_DIR, "tsdown.config.ts"),
    cwd: PACKAGE_DIR,
    outDir,
    logLevel: "silent",
  })
}, 60_000)

afterAll(() => rm(outDir, { recursive: true, force: true }))

/** CommonJS のファイル (`.cts`) を、Node の解決のしかた (`node16`) で型検査し、エラーの文を返す。 */
const typeErrorsOfCommonJs = async (source: string): Promise<string[]> => {
  const file = join(outDir, "consumer.cts")
  await writeFile(file, source)
  const program = ts.createProgram([file], {
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    strict: true,
    noEmit: true,
    types: [],
  })
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
}

describe("require で読む (CommonJS)", () => {
  it("プラグインそのものが返る", () => {
    const cosense: unknown = createRequire(import.meta.url)(join(outDir, "index.cjs"))
    expect(typeof cosense).toBe("function")
  })

  it("型も、require で返るプラグインそのものになる", async () => {
    const consumer = 'import cosense = require("./index.cjs")\ncosense({ className: "article" })\n'
    expect(await typeErrorsOfCommonJs(consumer)).toEqual([])
  })
})
