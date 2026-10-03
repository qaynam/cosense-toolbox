import { normalizeLineEndings, parse, type ParseOptions } from "@cosense-toolbox/parser"
import { collect } from "@cosense-toolbox/parser/utils"
import { Array as Arr, Match, Option, pipe } from "effect"
import {
  type CompletionItem,
  CompletionItemKind,
  type Definition,
  type Position,
} from "vscode-languageserver/node"

import { linkAt, type LinkTarget, type PageTarget } from "./link"
import { fenceOf } from "./tokens"
import type { Index, Page } from "./workspace"

/**
 * Where a completion applies, decided from the text alone.
 *
 * Cosense's own editor closes a bracket the moment it is typed, so a link is completed
 * inside a *closed* pair rather than after an opening one. Everything here is pure: the
 * candidates are somebody else's problem (see workspace.ts).
 */
export interface CompletionDetection {
  readonly kind: "link" | "hashtag"
  readonly query: string
  readonly replaceStart: number
  readonly replaceEnd: number
  /** `replaceStart` up to the cursor — what the client sees as already typed. */
  readonly typedText: string
}

// --- Which bracket is a link --------------------------------------------------------------

/**
 * A marker run followed by whitespace, or by nothing at all: the parser waits for a body,
 * but a menu that opens between `[* ` and its text is the flicker this rule exists to stop.
 * The markers are every character Cosense accepts in a decoration, from help-jp/文字装飾記法.
 */
const STARTS_DECORATION = /^[!"#%&'()*+,\-./{|}<>_~=]+(?:\s|$)/

/**
 * The notations a bracket can hold other than a page link: a formula, a project link, a
 * decoration, an icon, a URL, an image path.
 */
const OTHER_NOTATIONS: ReadonlyArray<RegExp> = [
  /^\$/,
  /^\//,
  STARTS_DECORATION,
  /^.+\.icon(?:\*\d+)?$/,
  /https?:\/\//i,
  /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i,
]

/**
 * True when the bracket holds a page link, or is on its way to one — the only bracket
 * completion answers in.
 *
 * The other notations (`[* 見出し]`, `[$ x^2]`, `[taro.icon]`, `[ラベル https://…]`,
 * `[a.png]`, `[/my-project/page]`) are left alone, because accepting a candidate replaces
 * the whole bracket and would take the notation with it.
 */
export const isLinkBracket = (inner: string): boolean =>
  inner === "" || !Arr.some(OTHER_NOTATIONS, (notation) => notation.test(inner))

// --- Where the cursor is ------------------------------------------------------------------

const isBracket = (char: string): boolean => char === "[" || char === "]"

/**
 * The `[` that opens the bracket around `cursor`: the nearest bracket to its left, if that
 * is an opening one. A `[` that is the second half of `[[` opens bold or a large image, not
 * a link.
 */
const openingBefore = (line: string, cursor: number): Option.Option<number> =>
  pipe(
    line.slice(0, cursor).split(""),
    Arr.findLastIndex(isBracket),
    Option.filter((open) => line[open] === "[" && line[open - 1] !== "["),
  )

/** The `]` that closes it: the nearest bracket to the right of `cursor`, if a closing one. */
const closingAfter = (line: string, cursor: number): Option.Option<number> =>
  pipe(
    line.slice(cursor).split(""),
    Arr.findFirstIndex(isBracket),
    Option.map((offset) => cursor + offset),
    Option.filter((close) => line[close] === "]"),
  )

/** Only inside a *closed* pair, matching Cosense. */
const detectLink = (line: string, cursor: number): Option.Option<CompletionDetection> =>
  pipe(
    Option.all([openingBefore(line, cursor), closingAfter(line, cursor)]),
    // The whole bracket content, not just up to the cursor: Cosense treats the link text
    // as one unit, so the candidates are the same wherever the cursor sits.
    Option.map(([open, close]) => ({ open, close, inner: line.slice(open + 1, close) })),
    Option.filter(({ inner }) => isLinkBracket(inner)),
    Option.map(({ open, close, inner }) => ({
      kind: "link",
      query: inner,
      replaceStart: open,
      replaceEnd: close + 1,
      typedText: line.slice(open, cursor),
    })),
  )

/**
 * A `#` at a tag boundary (the line's start, or after whitespace) and the tag name typed
 * after it up to the cursor, mirroring the parser's hashtag construct.
 */
const TAG_BEFORE_CURSOR = /(?:^|(?<=\s))#([^\s[\]#]*)$/

const detectHashtag = (line: string, cursor: number): Option.Option<CompletionDetection> =>
  pipe(
    Option.fromNullable(TAG_BEFORE_CURSOR.exec(line.slice(0, cursor))),
    Option.map(({ index, 1: query = "" }) => ({
      kind: "hashtag",
      query,
      replaceStart: index,
      replaceEnd: cursor,
      typedText: line.slice(index, cursor),
    })),
  )

/** Pure line/cursor -> completion trigger detection. No AST, no I/O. */
export const detectCompletion = (
  line: string,
  cursor: number,
): Option.Option<CompletionDetection> =>
  pipe(
    detectLink(line, cursor),
    Option.orElse(() => detectHashtag(line, cursor)),
  )

// --- In a document ------------------------------------------------------------------------

/**
 * Whether the cursor is where Cosense reads no notation, so a bracket or a `#` is only text:
 * inside code, or on a command line (`$ ls`). The cursor must be strictly between the
 * backticks (not touching them) to count as inside an inline span.
 */
const readsNoNotation = (
  text: string,
  { line, character }: Position,
  parseOptions: ParseOptions,
): boolean => {
  const page = parse(text, parseOptions)
  return (
    Arr.some(
      collect(page, "codeBlock"),
      ({ position }) => line >= position.start.line && line <= position.end.line,
    ) ||
    Arr.some(
      collect(page, "inlineCode"),
      ({ position }) =>
        line === position.start.line &&
        character > position.start.column &&
        character < position.end.column,
    ) ||
    Arr.some(
      collect(page, "line"),
      ({ monospace, position }) => monospace && position.start.line === line,
    )
  )
}

export interface CompletionOptions {
  /** Whether a `---` fence on the first line opens YAML to skip (default: true). */
  readonly frontmatter?: boolean
}

/** The line Cosense takes as the title: the first, or the first after the frontmatter. */
const titleLineOf = (lines: ReadonlyArray<string>, frontmatter: boolean): number =>
  Option.match(fenceOf(lines, frontmatter), { onNone: () => 0, onSome: (end) => end + 1 })

/**
 * `detectCompletion` for one line of a document. Nothing on the title line, which Cosense
 * does not read as notation, nor where it reads none (code, a command line). `parseOptions`
 * are the site's notation extensions, parsed with as the site's build parses.
 */
export const detectCompletionInDocument = (
  text: string,
  position: Position,
  parseOptions: ParseOptions = {},
  { frontmatter = true }: CompletionOptions = {},
): Option.Option<CompletionDetection> => {
  const lines = normalizeLineEndings(text).split("\n")
  return pipe(
    Option.liftPredicate(
      position,
      (at) =>
        at.line !== titleLineOf(lines, frontmatter) && !readsNoNotation(text, at, parseOptions),
    ),
    Option.flatMap((at) => detectCompletion(lines[at.line] ?? "", at.character)),
  )
}

// --- Matching titles ----------------------------------------------------------------------

/**
 * Title matching, so `[Side Kanban]` and `[side_kanban]` count as one page the way Cosense
 * links them: case-insensitive, space and `_` alike, and NFKC so width variants match too.
 */
export const normalizeForMatch = (s: string): string =>
  s.normalize("NFKC").toLowerCase().replace(/[_ ]/g, " ")

/** The title as a tag writes it: Cosense folds a space to `_`. */
export const asTagName = (title: string): string => title.replace(/ /g, "_")

/** A title that cannot be written as a tag at all is not offered as one. */
export const isTaggable = (title: string): boolean => !/[\s[\]#]/.test(asTagName(title))

// --- Answers ------------------------------------------------------------------------------

/** The last part of a `/`-separated location. */
const fileNameOf = (location: string): string =>
  Option.getOrElse(Arr.last(location.split("/")), () => location)

/**
 * A page as a candidate for `detection`, or None when it does not fit: a tag cannot hold a
 * space or a bracket, so a page whose title does is not offered after `#` (accepting it
 * would write something that reads as two tags).
 */
const candidate =
  (detection: CompletionDetection, line: number) =>
  (page: Page): Option.Option<CompletionItem> => {
    const query = normalizeForMatch(detection.query)
    const normalized = normalizeForMatch(page.title)
    const notation = Match.value(detection.kind).pipe(
      Match.when("hashtag", () => `#${asTagName(page.title)}`),
      Match.when("link", () => `[${page.title}]`),
      Match.exhaustive,
    )
    return pipe(
      Option.some(page),
      Option.filter(() => detection.kind === "link" || isTaggable(page.title)),
      Option.filter(() => query === "" || normalized.includes(query)),
      Option.map((): CompletionItem => ({
        label: page.title,
        kind: CompletionItemKind.File,
        // The file name alone: a whole path is cut off in the menu before the name shows.
        detail: fileNameOf(page.location),
        // The whole path, where the editor shows more room once the item is selected.
        documentation: page.location,
        // The whole notation is replaced, brackets included: the reader typed the `[`,
        // and leaving it in place would give `[[title]]`.
        textEdit: {
          range: {
            start: { line, character: detection.replaceStart },
            end: { line, character: detection.replaceEnd },
          },
          newText: notation,
        },
        // A client filters by the text from the edit's start to the cursor, `[設` here, so
        // it has to find that in the notation rather than in the bare title.
        filterText: notation,
        sortText: `${normalized} ${page.location}`,
      })),
    )
  }

/** The pages that complete what is typed at `position`, or none outside a link or a tag. */
export const completionItems = (
  index: Index,
  text: string,
  position: Position,
  parseOptions: ParseOptions = {},
  options: CompletionOptions = {},
): CompletionItem[] =>
  pipe(
    detectCompletionInDocument(text, position, parseOptions, options),
    Option.match({
      onNone: () => [],
      onSome: (detection) => Arr.filterMap(index.pages, candidate(detection, position.line)),
    }),
  )

/** A page of the reader's own project: the only kind the workspace can hold a file for. */
const isOwnPage = (target: LinkTarget): target is PageTarget =>
  target.kind === "page" && target.project === undefined

/**
 * The file of the page linked at `position`, opened at its top. None for a missing page, and
 * for a link that leads outside the workspace (another project, a URL).
 */
export const definitionOf = (
  index: Index,
  text: string,
  position: Position,
  parseOptions: ParseOptions = {},
): Option.Option<Definition> =>
  pipe(
    linkAt(text, position, parseOptions),
    Option.filter(isOwnPage),
    Option.map(({ title }) => normalizeForMatch(title)),
    Option.flatMap((key) =>
      Arr.findFirst(index.pages, (page) => normalizeForMatch(page.title) === key),
    ),
    Option.map(({ uri }) => {
      const start = { line: 0, character: 0 }
      return { uri, range: { start, end: start } }
    }),
  )
