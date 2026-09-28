import {
  type NodeOfType,
  normalizeLineEndings,
  parse,
  type ParseOptions,
} from "@cosense-toolbox/parser"
import { Array as Arr, Match, Option, pipe, Schema } from "effect"
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node"

import { normalizeForMatch } from "./completion"
import { COMPONENT_LINE, fenceOf } from "./tokens"
import { branch, gather, leaf } from "./tree"
import type { Index } from "./workspace"

/**
 * Links to pages no file holds.
 *
 * Only `[title]` links are checked. A tag names a tag page more often than a page, and a
 * `[/project/page]` link points outside the workspace; neither is expected to have a file.
 */

/** How loudly an unresolved link is reported, as the reader sets it. */
export const UnresolvedSeverity = Schema.Literal("off", "hint", "information", "warning", "error")

export type UnresolvedSeverity = typeof UnresolvedSeverity.Type

/**
 * The severity a setting names, or `warning` for one that is missing or unknown: the build
 * warns about the same links by default (`unresolved: "warn"`).
 */
export const severityOf = (setting: unknown): UnresolvedSeverity =>
  Option.getOrElse(
    Schema.decodeUnknownOption(UnresolvedSeverity)(setting),
    (): UnresolvedSeverity => "warning",
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
  /** How to parse: the site's notation extensions, so `[! 注意]` is not read as a link. */
  readonly parseOptions?: ParseOptions
  /** Whether a `---` fence on the first line opens YAML to skip (default: true). */
  readonly frontmatter?: boolean
}

/** A `[title]` link, and the line it is on in the file. */
interface LinkAt {
  readonly link: NodeOfType<"internalLink">
  readonly line: number
}

/**
 * Every `[title]` link in the body, with the line it is on in the file. The title line holds
 * no links, and neither does a `.csnx` component line.
 */
const linksIn = (
  text: string,
  {
    components = false,
    parseOptions = {},
    frontmatter = true,
  }: Omit<UnresolvedLinkOptions, "severity">,
): ReadonlyArray<LinkAt> => {
  const lines = normalizeLineEndings(text).split("\n")
  // The parser never sees the frontmatter, so its line numbers start after the fence.
  const offset = Option.match(fenceOf(lines, frontmatter), {
    onNone: () => 0,
    onSome: (end) => end + 1,
  })
  const isComponentLine = (line: number) =>
    components && COMPONENT_LINE.test(lines[line + offset] ?? "")

  return gather(parse(lines.slice(offset).join("\n"), parseOptions), (node) =>
    Match.value(node).pipe(
      Match.when({ type: "title" }, () => leaf<LinkAt>([])),
      Match.when({ type: "line" }, (line) =>
        isComponentLine(line.position.start.line) ? leaf<LinkAt>([]) : branch<LinkAt>([]),
      ),
      Match.when({ type: "internalLink" }, (link) =>
        branch([{ link, line: link.position.start.line + offset }]),
      ),
      Match.orElse(() => branch<LinkAt>([])),
    ),
  )
}

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
          linksIn(text, options),
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
