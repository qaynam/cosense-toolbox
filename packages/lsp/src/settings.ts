import { Array as Arr, Option, pipe, Record as Rec, Schema } from "effect"

import { severityOf, type UnresolvedSeverity } from "./diagnostics"
import { TokenNames } from "./tokens"

/**
 * What the reader can set, through the editor's initialization options:
 *
 * ```json
 * { "sources": ["src"], "unresolvedLinks": "warning", "frontmatter": true, "tokenNames": "lsp" }
 * ```
 *
 * Which markers open a decoration is not among them: that is Cosense's syntax, and the parser
 * reads every one of them (`[! 注意]` included) as Cosense Web does.
 */
export interface Settings {
  /**
   * Where the pages are, relative to each workspace folder. Empty reads the whole folder.
   * A site keeps its pages in a few directories, and the rest of the repository is noise.
   */
  readonly sources: ReadonlyArray<string>
  /** How loudly a link to a missing page is reported. */
  readonly unresolvedLinks: UnresolvedSeverity
  /**
   * Whether a `---` fence on a page's first line opens YAML to skip. Off for Cosense pages,
   * which have no frontmatter: a page titled `---` would otherwise lose its first lines.
   */
  readonly frontmatter: boolean
  /** The names semantic tokens are sent by (see `legendFor`). */
  readonly tokenNames: TokenNames
}

export const defaultSettings: Settings = {
  sources: [],
  unresolvedLinks: "warning",
  frontmatter: true,
  tokenNames: "lsp",
}

/** `schema`'s reading of `value`, or `fallback` when `value` is not of that shape. */
const decodeOr =
  <A, I>(schema: Schema.Schema<A, I>, fallback: A) =>
  (value: unknown): A =>
    Option.getOrElse(Schema.decodeUnknownOption(schema)(value), () => fallback)

/** The options as an object, which the editor may send in any shape or not at all. */
const OptionsObject = Schema.Record({ key: Schema.String, value: Schema.Unknown })

/**
 * The non-empty strings of a list. Anything else in it is dropped rather than failing the
 * whole list, and anything but a list counts as none.
 */
const stringsOf = (value: unknown): ReadonlyArray<string> =>
  Arr.filter(decodeOr(Schema.Array(Schema.Unknown), [])(value), Schema.is(Schema.NonEmptyString))

/**
 * Each setting read on its own, so one of the wrong shape falls back to its default
 * without taking the others with it.
 */
export const settingsOf = (options: unknown): Settings => {
  const field = (key: keyof Settings): unknown =>
    pipe(
      Schema.decodeUnknownOption(OptionsObject)(options),
      Option.flatMap(Rec.get(key)),
      Option.getOrUndefined,
    )
  return {
    sources: stringsOf(field("sources")),
    unresolvedLinks: severityOf(field("unresolvedLinks")),
    frontmatter: decodeOr(Schema.Boolean, defaultSettings.frontmatter)(field("frontmatter")),
    tokenNames: decodeOr(TokenNames, defaultSettings.tokenNames)(field("tokenNames")),
  }
}
