import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { readWorkspaces } from "./workspaces"

const repo = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "release-"))
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => {
      await mkdir(join(root, name, ".."), { recursive: true })
      await writeFile(join(root, name), text, "utf8")
    }),
  )
  return root
}

describe("readWorkspaces", () => {
  it("packages/ の下のパッケージを、場所と LICENSE の有無と一緒に読む", async () => {
    const root = await repo({
      "packages/parser/package.json": '{ "name": "@cosense-toolbox/parser", "version": "1.0.0" }',
      "packages/parser/LICENSE": "MIT",
      "packages/style/package.json": '{ "name": "@cosense-toolbox/style", "version": "1.0.0" }',
      "packages/notes.md": "パッケージではない",
    })
    const found = await Effect.runPromise(readWorkspaces(root))
    expect(found.map(({ dir, manifest, hasLicense }) => [dir, manifest.name, hasLicense])).toEqual([
      ["packages/parser", "@cosense-toolbox/parser", true],
      ["packages/style", "@cosense-toolbox/style", false],
    ])
  })
})
