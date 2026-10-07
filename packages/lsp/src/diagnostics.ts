import type { AnyNode, NodeOfType } from "@cosense-toolbox/parser"
import { Array as Arr, Match, Option, pipe, Schema } from "effect"
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node"

import { bodyNodes, type BodyOptions } from "./body"
import { normalizeForMatch } from "./completion"
import type { Index } from "./workspace"

/**
 * Links to pages no file holds.
 *
 * Only `[title]` links are checked. A tag names a tag page more often than a page, and a
 * `[/project/page]` link points outside the workspace; neither is expected to have a file.
 */

/** How loudly a diagnostic is reported, as the reader sets it. */
export const SEVERITIES = ["off", "hint", "information", "warning", "error"] as const

export type Severity = (typeof SEVERITIES)[number]

const SeveritySchema = Schema.Literal(...SEVERITIES)

/**
 * The severity a setting names, or `fallback` for one that is missing or unknown. For links
 * to missing pages that is `warning`: the build warns about the same links by default
 * (`unresolved: "warn"`).
 */
export const severityOf = (setting: unknown, fallback: Severity = "warning"): Severity =>
  Option.getOrElse(Schema.decodeUnknownOption(SeveritySchema)(setting), () => fallback)

/** The LSP's severity for a setting, or None for `off`. */
export const lspSeverity = (severity: Severity): Option.Option<DiagnosticSeverity> =>
  Match.value(severity).pipe(
    Match.when("off", () => Option.none()),
    Match.when("hint", () => Option.some(DiagnosticSeverity.Hint)),
    Match.when("information", () => Option.some(DiagnosticSeverity.Information)),
    Match.when("warning", () => Option.some(DiagnosticSeverity.Warning)),
    Match.when("error", () => Option.some(DiagnosticSeverity.Error)),
    Match.exhaustive,
  )

export interface UnresolvedLinkOptions extends BodyOptions {
  readonly severity: Severity
}

const internalLinkOf = (node: AnyNode): Option.Option<NodeOfType<"internalLink">> =>
  node.type === "internalLink" ? Option.some(node) : Option.none()

/** A diagnostic for each `[title]` link in `text` whose page is not in `index`. */
export const unresolvedLinkDiagnostics = (
  index: Index,
  text: string,
  options: UnresolvedLinkOptions,
): Diagnostic[] => {
  const withFile = new Set(Arr.map(index.pages, (page) => normalizeForMatch(page.title)))
  return pipe(
    lspSeverity(options.severity),
    Option.match({
      onNone: () => [],
      onSome: (severity) =>
        pipe(
          bodyNodes(text, internalLinkOf, options),
          Arr.filter(({ node: link }) => !withFile.has(normalizeForMatch(link.target))),
          Arr.map(({ node: link, line }): Diagnostic => ({
            range: {
              start: { line, character: link.position.start.column },
              end: { line, character: link.position.end.column },
            },
            severity,
            source: "cosense",
            code: "unresolved-link",
            message: `リンク先のページが見つからない: [${link.target}]`,
          })),
        ),
    }),
  )
}
