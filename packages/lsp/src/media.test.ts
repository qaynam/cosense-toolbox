import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { publicMedia } from "@cosense-toolbox/parser/extensions"
import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import { DiagnosticSeverity } from "vscode-languageserver/node"

import { detectCompletionInDocument } from "./completion"
import { mediaCompletionItems, mediaFilesIn, missingMediaDiagnostics } from "./media"

const directory = async (files: ReadonlyArray<string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "csn-media-"))
  for (const name of files) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), "", "utf8")
  }
  return root
}

const parseOptions = { extensions: [publicMedia()] }

describe("mediaFilesIn", () => {
  it("lists the images, videos and sounds under a directory, as site paths", async () => {
    const root = await directory(["images/a.png", "movies/b.mp4", "c.mp3", "docs/d.pdf"])
    expect([...(await Effect.runPromise(mediaFilesIn(root)))].sort()).toEqual([
      "/c.mp3",
      "/images/a.png",
      "/movies/b.mp4",
    ])
  })

  it("is empty for a directory that is not there", async () => {
    expect(await Effect.runPromise(mediaFilesIn("/no/such/directory"))).toEqual([])
  })
})

describe("mediaCompletionItems", () => {
  const files = ["/images/a.png", "/images/b.png", "/movies/a.mp4"]
  const itemsAt = (text: string, character: number) =>
    Option.match(detectCompletionInDocument(text, { line: 1, character }, parseOptions), {
      onNone: () => [],
      onSome: (detection) => mediaCompletionItems(files, detection, 1),
    })

  it("offers the files whose path holds what is typed after :/", () => {
    expect(itemsAt("T\n[:/images]", 5).map((item) => item.label)).toEqual([
      "/images/a.png",
      "/images/b.png",
    ])
  })

  it("replaces the whole bracket with the file's notation", () => {
    const [item] = itemsAt("T\n[:/movies]", 5)
    expect(item?.textEdit).toEqual({
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
      newText: "[:/movies/a.mp4]",
    })
  })

  it("offers nothing for a bracket that is not a site path", () => {
    expect(itemsAt("T\n[images]", 3)).toEqual([])
  })
})

describe("missingMediaDiagnostics", () => {
  const files = new Set(["/images/a.png"])
  const flagged = (text: string) =>
    missingMediaDiagnostics(text, files, { severity: "warning", parseOptions }).map(
      ({ message }) => message,
    )

  it("flags a site path no file is at", () => {
    expect(flagged("T\n[:/images/a.png] [:/images/none.png] [[:/movies/none.mp4]]")).toEqual([
      "ファイルが見つからない: /images/none.png",
      "ファイルが見つからない: /movies/none.mp4",
    ])
  })

  it("leaves images by URL alone", () => {
    expect(flagged("T\n[https://example.invalid/none.png]")).toEqual([])
  })

  it("is as loud as the setting says, and says nothing when off", () => {
    const text = "T\n[:/none.png]"
    expect(
      missingMediaDiagnostics(text, files, { severity: "hint", parseOptions })[0]?.severity,
    ).toBe(DiagnosticSeverity.Hint)
    expect(missingMediaDiagnostics(text, files, { severity: "off", parseOptions })).toEqual([])
  })
})
