import type { AnyNode, NodeOfType } from "@cosense-toolbox/parser"
import { Array as Arr, Option, pipe } from "effect"
import {
  type CodeAction,
  CodeActionKind,
  type Diagnostic,
  type Range,
} from "vscode-languageserver/node"

import { bodyNodes, type BodyOptions, type InFile } from "./body"
import { lspSeverity, type Severity } from "./diagnostics"

/**
 * Google Maps URLs that Cosense would write as a map.
 *
 * Cosense Web turns such a URL into its map notation (`[N35.68,E139.76,Z15]`) as it is
 * pasted. A file is written in another editor, so the same is offered here after the fact,
 * as a diagnostic and a quick fix. A URL kept as it is stays untouched: it is only pointed out.
 */

type ExternalLink = NodeOfType<"externalLink">

/** The coordinates in a Maps path: `/@35.68,139.76` and also `/35.68,139.76`. */
const COORDINATES = /\/@?([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/
const ZOOM = /,(\d+(?:\.\d+)?)z/
const PLACE = /\/(?:place|search)\/(.+?)\//

const matchOf = (pattern: RegExp, text: string): Option.Option<RegExpExecArray> =>
  Option.fromNullable(pattern.exec(text))

const decode = Option.liftThrowable(decodeURIComponent)

/** `35.68` → `N35.68`, `-33.86` → `S33.86`: Cosense writes the sign as a hemisphere. */
const hemisphere = (degrees: string, positive: string, negative: string): string =>
  degrees.startsWith("-")
    ? `${negative}${degrees.slice(1)}`
    : `${positive}${degrees.replace(/^\+/, "")}`

/**
 * The map notation Cosense Web writes for a Google Maps URL, or None for any other URL.
 * Only `www.google.*` with `/maps/` in the path counts, and only with coordinates in the
 * path; the zoom is rounded down and the place's name, when there is one, is the label.
 */
export const mapNotationOf = (url: string): Option.Option<string> =>
  pipe(
    Option.liftThrowable(() => new URL(url))(),
    Option.filter(
      ({ host, pathname }) => /^www\.google\./.test(host) && pathname.includes("/maps/"),
    ),
    Option.flatMap(({ pathname }) =>
      pipe(
        matchOf(COORDINATES, pathname),
        Option.map(([, latitude = "", longitude = ""]) => {
          const zoom = pipe(
            matchOf(ZOOM, pathname),
            Option.map(([, level = ""]) => `,Z${Number.parseInt(level, 10)}`),
            Option.getOrElse(() => ""),
          )
          const label = pipe(
            matchOf(PLACE, pathname),
            Option.flatMap(([, name = ""]) => decode(name)),
            Option.map((name) => ` ${name.replaceAll("+", " ")}`),
            Option.getOrElse(() => ""),
          )
          return `[${hemisphere(latitude, "N", "S")},${hemisphere(longitude, "E", "W")}${zoom}${label}]`
        }),
      ),
    ),
  )

interface MapLink {
  readonly link: ExternalLink
  readonly notation: string
}

/**
 * A URL written as a link and nothing more: bare, or alone in brackets. A link given a label
 * of its own was written that way on purpose, and one in code is not a link at all.
 */
const mapLinkOf = (node: AnyNode): Option.Option<MapLink> =>
  node.type === "externalLink" && node.label === node.target
    ? Option.map(mapNotationOf(node.target), (notation) => ({ link: node, notation }))
    : Option.none()

const rangeOf = ({ node: { link }, line }: InFile<MapLink>): Range => ({
  start: { line, character: link.position.start.column },
  end: { line, character: link.position.end.column },
})

export interface MapLinkOptions extends BodyOptions {
  readonly severity: Severity
}

/** A diagnostic for each Google Maps URL in `text` that Cosense would write as a map. */
export const mapLinkDiagnostics = (text: string, options: MapLinkOptions): Diagnostic[] =>
  pipe(
    lspSeverity(options.severity),
    Option.match({
      onNone: () => [],
      onSome: (severity) =>
        Arr.map(bodyNodes(text, mapLinkOf, options), (found): Diagnostic => ({
          range: rangeOf(found),
          severity,
          source: "cosense",
          code: "map-url",
          message: `Google マップの URL は地図の記法にできる: ${found.node.notation}`,
        })),
    }),
  )

const overlaps = (a: Range, b: Range): boolean =>
  a.start.line <= b.end.line &&
  b.start.line <= a.end.line &&
  (a.start.line !== b.end.line || a.start.character <= b.end.character) &&
  (b.start.line !== a.end.line || b.start.character <= a.end.character)

/**
 * The quick fix for each Google Maps URL that `range` touches: its map notation in its
 * place. Offered whatever the diagnostic's setting, so it is there even with it off.
 */
export const mapLinkActions = (
  uri: string,
  text: string,
  range: Range,
  options: BodyOptions,
): CodeAction[] =>
  pipe(
    bodyNodes(text, mapLinkOf, options),
    Arr.filter((found) => overlaps(rangeOf(found), range)),
    Arr.map((found): CodeAction => ({
      title: `地図の記法にする: ${found.node.notation}`,
      kind: CodeActionKind.QuickFix,
      edit: { changes: { [uri]: [{ range: rangeOf(found), newText: found.node.notation }] } },
    })),
  )
