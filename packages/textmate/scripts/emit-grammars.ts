/**
 * Writes the grammars as `.tmLanguage.json`, for editors that load the file itself.
 * They are built from src/grammar.ts, so the files are output, not source.
 */
import { mkdirSync, writeFileSync } from "node:fs"

import { cosense, cosenseX } from "../src/index"

const dir = new URL("../grammars/", import.meta.url)
mkdirSync(dir, { recursive: true })
for (const grammar of [cosense, cosenseX]) {
  writeFileSync(
    new URL(`${grammar.name}.tmLanguage.json`, dir),
    `${JSON.stringify(grammar, null, 2)}\n`,
  )
}
