import { describe, expect, it } from "vitest"
import { DiagnosticSeverity } from "vscode-languageserver/node"

import { severityOf, unresolvedLinkDiagnostics } from "./diagnostics"
import { defaultSettings, parseOptionsOf } from "./settings"
import type { Index } from "./workspace"

const index: Index = {
  pages: [
    { title: "設計メモ", uri: "file:///w/design.csn", location: "design.csn" },
    { title: "Side Kanban", uri: "file:///w/kanban.csn", location: "kanban.csn" },
  ],
}

/** The link text each diagnostic points at, read back out of `text` by its range. */
const flagged = (text: string, options: { components?: boolean } = {}) =>
  unresolvedLinkDiagnostics(index, text, { severity: "warning", ...options }).map(
    ({ range }) =>
      text.split("\n")[range.start.line]?.slice(range.start.character, range.end.character) ?? "",
  )

describe("unresolvedLinkDiagnostics", () => {
  it("flags a link to a page no file holds, over the whole bracket", () => {
    expect(flagged("T\n[無いページ] と [設計メモ]")).toEqual(["[無いページ]"])
  })

  it("matches titles the way links do: case, space and _ alike", () => {
    expect(flagged("T\n[side_kanban] [SIDE KANBAN]")).toEqual([])
  })

  it("reads the decorations it is told about as decorations, not links to check", () => {
    const text = "T\n[! 注意] [無いページ]"
    const decorated = unresolvedLinkDiagnostics(index, text, {
      severity: "warning",
      parseOptions: parseOptionsOf({ ...defaultSettings, decorations: ["!"] }),
    })
    expect(decorated.map((d) => d.message)).toEqual([
      "リンク先のページが見つからない: [無いページ]",
    ])
    expect(flagged(text)).toEqual(["[! 注意]", "[無いページ]"])
  })

  it("leaves tags and links to other projects alone", () => {
    expect(flagged("T\n#無いタグ [/help-jp/無いページ]")).toEqual([])
  })

  it("leaves code alone, where a bracket is not a link", () => {
    expect(flagged("T\n`[無いページ]`\ncode:a.js\n [無いページ]")).toEqual([])
  })

  it("leaves the title line alone: nothing on it is a link", () => {
    expect(flagged("[無いページ]\n本文")).toEqual([])
  })

  it("counts lines from the top of the file, past the frontmatter", () => {
    const [diagnostic] = unresolvedLinkDiagnostics(index, "---\na: 1\n---\nT\n[無いページ]", {
      severity: "warning",
    })
    expect(diagnostic?.range).toEqual({
      start: { line: 4, character: 0 },
      end: { line: 4, character: 7 },
    })
  })

  it("leaves a .csnx component line alone, but not in .csn", () => {
    const text = 'T\n<Note href="[無いページ]" />'
    expect(flagged(text, { components: true })).toEqual([])
    expect(flagged(text)).toEqual(["[無いページ]"])
  })

  it("names the page it could not find, as the build's warning does", () => {
    const [diagnostic] = unresolvedLinkDiagnostics(index, "T\n[無いページ]", {
      severity: "warning",
    })
    expect(diagnostic?.message).toBe("リンク先のページが見つからない: [無いページ]")
    expect(diagnostic?.source).toBe("cosense")
  })

  it("reports at the severity asked for, and not at all when off", () => {
    const at = (severity: Parameters<typeof severityOf>[0]) =>
      unresolvedLinkDiagnostics(index, "T\n[無いページ]", { severity: severityOf(severity) }).map(
        (diagnostic) => diagnostic.severity,
      )
    expect(at("error")).toEqual([DiagnosticSeverity.Error])
    expect(at("warning")).toEqual([DiagnosticSeverity.Warning])
    expect(at("information")).toEqual([DiagnosticSeverity.Information])
    expect(at("hint")).toEqual([DiagnosticSeverity.Hint])
    expect(at("off")).toEqual([])
  })
})

describe("severityOf", () => {
  it("reads the setting the editor sends", () => {
    expect(severityOf("error")).toBe("error")
    expect(severityOf("off")).toBe("off")
  })

  it("falls back to warning for a missing or unknown setting", () => {
    expect(severityOf(undefined)).toBe("warning")
    expect(severityOf("loud")).toBe("warning")
    expect(severityOf(3)).toBe("warning")
  })
})
