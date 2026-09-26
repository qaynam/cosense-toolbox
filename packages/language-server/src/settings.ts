import type { ParseOptions } from "@cosense-toolbox/parser"
import { customDecorations } from "@cosense-toolbox/parser/extensions"
import { Array as Arr, Predicate } from "effect"

import { severityOf, type UnresolvedSeverity } from "./diagnostics"

/**
 * What the reader can set, through the editor's initialization options:
 *
 * ```json
 * { "sources": ["src"], "decorations": ["!"], "unresolvedLinks": "warning" }
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
}

export const defaultSettings: Settings = {
  sources: [],
  decorations: [],
  unresolvedLinks: "warning",
}

/** One field of the options, which the editor may send in any shape or not at all. */
const fieldOf = (options: unknown, key: string): unknown =>
  Predicate.isRecord(options) ? options[key] : undefined

/** The non-empty strings of a list; anything else counts as not set. */
const stringsOf = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value)
    ? Arr.filter(value, (item): item is string => Predicate.isString(item) && item !== "")
    : []

export const settingsOf = (options: unknown): Settings => ({
  sources: stringsOf(fieldOf(options, "sources")),
  decorations: stringsOf(fieldOf(options, "decorations")),
  unresolvedLinks: severityOf(fieldOf(options, "unresolvedLinks")),
})

/** How the pages are parsed, so the server reads notation as the site's build does. */
export const parseOptionsOf = ({ decorations }: Settings): ParseOptions =>
  Arr.isNonEmptyReadonlyArray(decorations) ? { extensions: [customDecorations(decorations)] } : {}
