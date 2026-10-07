/**
 * `@cosense-toolbox/lsp/link`. The modules inside answer in effect's types; what is handed
 * out here is plain, so a user need not know effect.
 */
import type { ParseOptions } from "@cosense-toolbox/parser"
import { Option } from "effect"
import type { Position } from "vscode-languageserver/node"

import { type LinkTarget, linkAt as linkOption } from "../link"

export * from "../link"

/**
 * The link at `position`, and what it leads to. Null where there is no link: on plain text,
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
): LinkTarget | null => Option.getOrNull(linkOption(text, position, parseOptions))
