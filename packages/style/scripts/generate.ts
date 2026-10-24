/**
 * style.css から csn.css を作る。
 * style.css を直したら `bun run generate` で作り直す (作り忘れはテストが落として知らせる)。
 */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { csnCssOf } from "../src/csn"

const packageDir = join(import.meta.dirname, "..")
const styleCss = await readFile(join(packageDir, "style.css"), "utf8")

await writeFile(join(packageDir, "csn.css"), csnCssOf(styleCss))
