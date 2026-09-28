import type { ParseOptions } from "@cosense-toolbox/parser"
import { customDecorations } from "@cosense-toolbox/parser/extensions"
import { Array as Arr, Option, pipe, Record as Rec, Schema } from "effect"

import { severityOf, type UnresolvedSeverity } from "./diagnostics"

/**
 * What the reader can set, through the editor's initialization options:
 *
 * ```json
 * { "sources": ["src"], "decorations": ["!"], "unresolvedLinks": "warning", "frontmatter": true }
 * ```
 */
export interface Settings {
  /**
   * Where the pages are, relative to each workspace folder. Empty reads the whole folder.
   * A site keeps its pages in a few directories, and the rest of the repository is noise.
   */
  readonly sources: ReadonlyArray<string>
  /**
   * Markers read as text decorations on top of Cosense's own (`* / - _`), as the site's
   * `customDecorations` has them. Without them, `[! 注意]` reads as a link to a page called
   * "! 注意".
   */
  readonly decorations: ReadonlyArray<string>
  /** How loudly a link to a missing page is reported. */
  readonly unresolvedLinks: UnresolvedSeverity
  /**
   * Whether a `---` fence on a page's first line opens YAML to skip. Off for Cosense pages,
   * which have no frontmatter: a page titled `---` would otherwise lose its first lines.
   */
  readonly frontmatter: boolean
}

export const defaultSettings: Settings = {
  sources: [],
  decorations: [],
  unresolvedLinks: "warning",
  frontmatter: true,
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
    decorations: stringsOf(field("decorations")),
    unresolvedLinks: severityOf(field("unresolvedLinks")),
    frontmatter: decodeOr(Schema.Boolean, defaultSettings.frontmatter)(field("frontmatter")),
  }
}

/** How the pages are parsed, so the server reads notation as the site's build does. */
export const parseOptionsOf = ({ decorations }: Settings): ParseOptions =>
  Arr.match(decorations, {
    onEmpty: (): ParseOptions => ({}),
    onNonEmpty: (markers): ParseOptions => ({ extensions: [customDecorations(markers)] }),
  })
