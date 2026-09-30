import type { AnyNode, ParseOptions, Position as NodePosition } from "@cosense-toolbox/parser"
import { normalizeLineEndings, parse } from "@cosense-toolbox/parser"
import { Array as Arr, Match, Option, pipe } from "effect"
import type { Position, Range } from "vscode-languageserver/node"

import { branch, gather, leaf, type Picked } from "./tree"

/**
 * A page a link leads to. `project` is there only when the link names one
 * (`[/help-jp/page]`); without it the page is in the reader's own project. `lineId` is
 * there only when the link names a line of the page (`[page#<line id>]`).
 */
export interface PageTarget {
  readonly kind: "page"
  readonly project?: string
  /** As written: empty for `[/project]`, which leads to the project rather than a page. */
  readonly title: string
  readonly lineId?: string
  readonly range: Range
}

/** A URL a link leads to: an external link, or an image and where it links. */
export interface UrlTarget {
  readonly kind: "url"
  readonly url: string
  readonly range: Range
}

/** What a link leads to, and the range of the whole notation it is written as. */
export type LinkTarget = PageTarget | UrlTarget

/** The id Cosense gives every line, after the `#` that ends a link to it. */
const LINE_LINK = /^(.+)#([0-9a-f]{24})$/

const ICON = /^(.+)\.icon(?:\*\d+)?$/

/** `/project/name`, as an icon of another project writes its user. */
const OF_PROJECT = /^\/([^/]+)\/(.+)$/

/** `{ [key]: value }` when there is a value, else nothing: an absent field, not `undefined`. */
const fieldOf = <K extends string, A>(key: K, value: Option.Option<A>) =>
  Option.match(value, {
    onNone: () => ({}),
    onSome: (present) => ({ [key]: present }) as { readonly [P in K]: A },
  })

/** The parser counts columns in UTF-16 units, as the LSP does, so they carry over as is. */
const rangeOf = ({ start, end }: NodePosition): Range => ({
  start: { line: start.line, character: start.column },
  end: { line: end.line, character: end.column },
})

const pageOf = (range: Range, project: Option.Option<string>, written: string): PageTarget =>
  pipe(
    Option.fromNullable(LINE_LINK.exec(written)),
    Option.match({
      onNone: () => ({ title: written, lineId: Option.none<string>() }),
      onSome: ([, title = "", lineId = ""]) => ({ title, lineId: Option.some(lineId) }),
    }),
    ({ title, lineId }) => ({
      kind: "page",
      ...fieldOf("project", project),
      title,
      ...fieldOf("lineId", lineId),
      range,
    }),
  )

const urlOf = (range: Range, url: string): UrlTarget => ({ kind: "url", url, range })

/** The page of an icon's user, who may be of another project (`/icons/taro`). */
const iconPageOf = (range: Range, user: string): PageTarget =>
  pipe(
    Option.fromNullable(OF_PROJECT.exec(user)),
    Option.match({
      onNone: () => pageOf(range, Option.none(), user),
      onSome: ([, project = "", name = ""]) => pageOf(range, Option.some(project), name),
    }),
  )

/**
 * `[[taro.icon]]`, which the parser reads as bold text (`[[x]]`) rather than as an icon.
 * Only the double bracket counts: `[* taro.icon]` is bold text that Cosense shows as is.
 */
const largeIconOf = (
  lines: ReadonlyArray<string>,
  range: Range,
  value: string,
): Option.Option<PageTarget> =>
  pipe(
    Option.fromNullable(lines[range.start.line]),
    Option.filter((line) => line.startsWith("[[", range.start.character)),
    Option.flatMap(() => Option.fromNullable(ICON.exec(value))),
    Option.map(([, user = ""]) => iconPageOf(range, user)),
  )

const targetsOf =
  (lines: ReadonlyArray<string>) =>
  (node: AnyNode): Picked<LinkTarget> =>
    Match.value(node).pipe(
      Match.discriminators("type")({
        internalLink: ({ target, position }) =>
          leaf([pageOf(rangeOf(position), Option.none(), target)]),
        hashtag: ({ value, position }) => leaf([pageOf(rangeOf(position), Option.none(), value)]),
        projectLink: ({ project, title, position }) =>
          leaf([pageOf(rangeOf(position), Option.some(project), title)]),
        icon: ({ user, position }) => leaf([iconPageOf(rangeOf(position), user)]),
        externalLink: ({ target, position }) => leaf([urlOf(rangeOf(position), target)]),
        // Where an image or a video leads, when it leads anywhere, is what following it opens.
        image: ({ src, link, position }) => leaf([urlOf(rangeOf(position), link ?? src)]),
        video: ({ src, link, position }) => leaf([urlOf(rangeOf(position), link ?? src)]),
        audio: ({ src, position }) => leaf([urlOf(rangeOf(position), src)]),
        embed: ({ url, position }) => leaf([urlOf(rangeOf(position), url)]),
        // A decoration can wrap links (`[! [page]です]`), so it is read into.
        decoration: ({ value, position }) =>
          pipe(
            largeIconOf(lines, rangeOf(position), value),
            Option.match({ onNone: () => branch([]), onSome: (page) => leaf([page]) }),
          ),
      }),
      Match.orElse(() => branch([])),
    )

/**
 * Whether `character` is on the notation at `range`: on any of its characters, or just
 * after the last one, where the cursor is left after typing it.
 */
const touches = (range: Range, { line, character }: Position): boolean =>
  range.start.line === line &&
  range.start.character <= character &&
  character <= range.end.character

/**
 * The link at `position`, and what it leads to. None where there is no link: on plain text,
 * on the markers of a decoration, in code.
 *
 * Resolving the target (to a file, a URL, a page of the web) is the caller's: it may be
 * asynchronous, or fail, in ways only the caller knows. `parseOptions` are the site's
 * notation extensions, so a bracket reads as the site's build reads it.
 */
export const linkAt = (
  text: string,
  position: Position,
  parseOptions: ParseOptions = {},
): Option.Option<LinkTarget> => {
  const normalized = normalizeLineEndings(text)
  const lines = normalized.split("\n")
  const under = Arr.filter(gather(parse(normalized, parseOptions), targetsOf(lines)), (target) =>
    touches(target.range, position),
  )
  // Two notations can touch (`[a][b]`): the one that starts under the cursor is the one
  // it is on, and the one it is just after is only a fallback.
  return pipe(
    Arr.findFirst(under, ({ range }) => position.character < range.end.character),
    Option.orElse(() => Arr.head(under)),
  )
}
