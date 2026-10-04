import { Array as Arr, Option, pipe, Record as Rec, Schema } from "effect"

import { type Severity, severityOf } from "./diagnostics"

/**
 * What the reader can set, through the editor's initialization options:
 *
 * ```json
 * { "sources": ["src"], "unresolvedLinks": "warning", "mapLinks": "information", "frontmatter": true, "mediaRoot": "public" }
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
  readonly unresolvedLinks: Severity
  /**
   * How loudly a Google Maps URL that Cosense would write as a map is pointed out. Quieter
   * than a missing page by default: a URL may be kept as it is on purpose.
   */
  readonly mapLinks: Severity
  /**
   * Whether a `---` fence on a page's first line opens YAML to skip. Off for Cosense pages,
   * which have no frontmatter: a page titled `---` would otherwise lose its first lines.
   */
  readonly frontmatter: boolean
  /**
   * The directory a site serves its files from, relative to each workspace folder. When one
   * holds it, `[:/images/a.png]` is read as the image there (the parser's `publicMedia`)
   * rather than as a link to a page of that name. A folder of plain Cosense pages has none,
   * and reads such a bracket as Cosense Web does.
   */
  readonly mediaRoot: string
}

export const defaultSettings: Settings = {
  sources: [],
  unresolvedLinks: "warning",
  mapLinks: "information",
  frontmatter: true,
  mediaRoot: "public",
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
    mapLinks: severityOf(field("mapLinks"), defaultSettings.mapLinks),
    frontmatter: decodeOr(Schema.Boolean, defaultSettings.frontmatter)(field("frontmatter")),
    mediaRoot: decodeOr(Schema.NonEmptyString, defaultSettings.mediaRoot)(field("mediaRoot")),
  }
}
