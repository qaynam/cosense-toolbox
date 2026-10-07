/**
 * `@cosense-toolbox/lsp/tokens`. The modules inside answer in effect's types; what is handed
 * out here is plain, so a user need not know effect.
 */
import { Option } from "effect"

import { fenceOf as fenceOption, frontmatterEnd as frontmatterEndOption } from "../tokens"

export * from "../tokens"

/**
 * The last line of the `---` fence around YAML at the very top, or null when the file does
 * not open with one.
 */
export const frontmatterEnd = (lines: ReadonlyArray<string>): number | null =>
  Option.getOrNull(frontmatterEndOption(lines))

/**
 * `frontmatterEnd`, or null when the caller reads no frontmatter: a Cosense page has none,
 * and a page whose title is `---` would otherwise lose its first lines to it.
 */
export const fenceOf = (lines: ReadonlyArray<string>, frontmatter: boolean): number | null =>
  Option.getOrNull(fenceOption(lines, frontmatter))
