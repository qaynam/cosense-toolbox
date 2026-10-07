/**
 * `@cosense-toolbox/lsp/completion`. The modules inside answer in effect's types; what is
 * handed out here is plain, so a user need not know effect.
 */
import type { ParseOptions } from "@cosense-toolbox/parser"
import { Option } from "effect"
import type { Definition, Position } from "vscode-languageserver/node"

import {
  type CompletionDetection,
  type CompletionOptions,
  definitionOf as definitionOption,
  detectCompletion as detectionOption,
  detectCompletionInDocument as detectionInDocumentOption,
} from "../completion"
import type { Index } from "../workspace"

export * from "../completion"

/** What is being typed at `cursor` of `line`, in a link or a tag, or null outside them. */
export const detectCompletion = (line: string, cursor: number): CompletionDetection | null =>
  Option.getOrNull(detectionOption(line, cursor))

/**
 * `detectCompletion` for one line of a document. Null on the title line, which Cosense does
 * not read as notation, and where it reads none (code, a command line). `parseOptions` are the
 * site's notation extensions, parsed with as the site's build parses.
 */
export const detectCompletionInDocument = (
  text: string,
  position: Position,
  parseOptions: ParseOptions = {},
  options: CompletionOptions = {},
): CompletionDetection | null =>
  Option.getOrNull(detectionInDocumentOption(text, position, parseOptions, options))

/**
 * The file of the page linked at `position`, opened at its top. Null for a missing page, and
 * for a link that leads outside the workspace (another project, a URL).
 */
export const definitionOf = (
  index: Index,
  text: string,
  position: Position,
  parseOptions: ParseOptions = {},
): Definition | null => Option.getOrNull(definitionOption(index, text, position, parseOptions))
