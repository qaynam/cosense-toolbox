/**
 * `@cosense-toolbox/style` の style.css から src/styles.generated.ts を作る。
 * style.css を直したら `bun run generate` で作り直す (作り忘れはテストが落として知らせる)。
 */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { extractStyles } from "../src/extract"

const packageDir = join(import.meta.dirname, "..")
const css = await readFile(join(packageDir, "..", "style", "style.css"), "utf8")

const source = `/**
 * 生成物。編集しない。
 * packages/style/style.css から \`bun run generate\` で作る。
 */
import type { CosenseStyles } from './extract'

export const styles: CosenseStyles = ${JSON.stringify(extractStyles(css), null, 2)}
`

await writeFile(join(packageDir, "src", "styles.generated.ts"), source)
