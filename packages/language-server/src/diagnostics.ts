import { type NodeOfType, normalizeLineEndings, parse } from "@cosense-toolbox/parser"
import { visit } from "@cosense-toolbox/parser/utils"
import { Array as Arr, Match, Option, pipe } from "effect"
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node"

import { normalizeForMatch } from "./completion"
import { COMPONENT_LINE, frontmatterEnd } from "./tokens"
import type { Index } from "./workspace"

/**
 * Links to pages no file holds.
 *
 * Only `[title]` links are checked. A tag names a tag page more often than a page, and a
 * `[/project/page]` link points outside the workspace; neither is expected to have a file.
 */

/** How loudly an unresolved link is reported, as the reader sets it. */
export type UnresolvedSeverity = "off" | "hint" | "information" | "warning" | "error"

const SEVERITIES: ReadonlyArray<UnresolvedSeverity> = [
  "off",
  "hint",
  "information",
  "warning",
  "error",
]

/**
 * The severity a setting names, or `warning` for one that is missing or unknown: the build
 * warns about the same links by default (`unresolved: "warn"`).
 */
export const severityOf = (setting: unknown): UnresolvedSeverity =>
  pipe(
    Arr.findFirst(SEVERITIES, (severity) => severity === setting),
    Option.getOrElse((): UnresolvedSeverity => "warning"),
  )

/** The LSP's severity for a setting, or None for `off`. */
const lspSeverity = (severity: UnresolvedSeverity): Option.Option<DiagnosticSeverity> =>
  Match.value(severity).pipe(
    Match.when("off", () => Option.none()),
    Match.when("hint", () => Option.some(DiagnosticSeverity.Hint)),
    Match.when("information", () => Option.some(DiagnosticSeverity.Information)),
    Match.when("warning", () => Option.some(DiagnosticSeverity.Warning)),
    Match.when("error", () => Option.some(DiagnosticSeverity.Error)),
    Match.exhaustive,
  )

export interface UnresolvedLinkOptions {
  readonly severity: UnresolvedSeverity
  /** `.csnx`: a component line is JSX, and a bracket in it is not a link. */
  readonly components?: boolean
}

/**
 * Every `[title]` link in the body, with the line it is on in the file. The title line holds
 * no links, and neither does a `.csnx` component line.
 */
const linksIn = (
  text: string,
  components: boolean,
): ReadonlyArray<{ readonly link: NodeOfType<"internalLink">; readonly line: number }> => {
  const lines = normalizeLineEndings(text).split("\n")
  // The parser never sees the frontmatter, so its line numbers start after the fence.
  const offset = Option.match(frontmatterEnd(lines), { onNone: () => 0, onSome: (end) => end + 1 })
  const isComponentLine = (line: number) =>
    components && COMPONENT_LINE.test(lines[line + offset] ?? "")

  const links: { link: NodeOfType<"internalLink">; line: number }[] = []
  visit(parse(lines.slice(offset).join("\n")), (node) =>
    Match.value(node).pipe(
      Match.when({ type: "title" }, () => "skip" as const),
      Match.when({ type: "line" }, (line) =>
        isComponentLine(line.position.start.line) ? ("skip" as const) : undefined,
      ),
      Match.when({ type: "internalLink" }, (link) => {
        links.push({ link, line: link.position.start.line + offset })
        return undefined
      }),
      Match.orElse(() => undefined),
    ),
  )
  return links
}

/** A diagnostic for each `[title]` link in `text` whose page no file in `index` holds. */
export const unresolvedLinkDiagnostics = (
  index: Index,
  text: string,
  options: UnresolvedLinkOptions,
): Diagnostic[] => {
  const withFile = new Set(
    Arr.filterMap(index.pages, (page) =>
      Option.map(Option.fromNullable(page.uri), () => normalizeForMatch(page.title)),
    ),
  )
  return pipe(
    lspSeverity(options.severity),
    Option.match({
      onNone: () => [],
      onSome: (severity) =>
        pipe(
          linksIn(text, options.components ?? false),
          Arr.filter(({ link }) => !withFile.has(normalizeForMatch(link.target))),
          Arr.map(({ link, line }): Diagnostic => ({
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
