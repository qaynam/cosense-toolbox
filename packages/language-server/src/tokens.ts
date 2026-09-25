import type { AnyNode, AnyNodeType, Decoration, Position } from '@cosense-toolbox/parser'
import { normalizeLineEndings, parse } from '@cosense-toolbox/parser'
import { visit } from '@cosense-toolbox/parser/utils'

/**
 * Cosense notation as LSP semantic tokens.
 *
 * These names are the ones this package reasons in, and they are not what goes on the wire.
 * A client announces the token types it knows at initialize and drops everything else —
 * Zed sends the LSP's own list and nothing more — so `quote` would simply never be drawn.
 * LEGEND below is what is sent, and LSP_TYPE is the translation.
 */
export const TOKEN_TYPES = [
  'title',
  'link',
  'projectLink',
  'externalLink',
  'hashtag',
  'code',
  'codeBlock',
  'formula',
  'icon',
  'quote',
  'bold',
  'italic',
  'strike',
  'underline',
  'image',
  'table',
  'bold2',
  'bold3',
  // `.csnx` only: a line that is one component tag.
  'component',
  // The YAML at the top of the file, which is not Cosense notation at all.
  'frontmatter',
] as const

export type TokenType = (typeof TOKEN_TYPES)[number]

export interface RawToken {
  readonly line: number
  readonly char: number
  readonly length: number
  readonly type: TokenType
}

/**
 * The legend sent to the client: the LSP's own token types, in its own order.
 *
 * Every entry is in the set a client is expected to understand, which is what makes the
 * colours appear without the reader configuring anything.
 */
export const LEGEND = [
  'namespace',
  'type',
  'function',
  'variable',
  'property',
  'parameter',
  'decorator',
  'macro',
  'keyword',
  'string',
  'number',
  'comment',
] as const

/**
 * What each notation is drawn as. Chosen so that things a reader separates by eye land on
 * different entries: a link is not a tag, and a quote is not a heading. `bold` and its
 * louder siblings share one entry, because the LSP has no notion of weight and a theme
 * gives each type a single colour.
 */
const LSP_TYPE: Record<TokenType, (typeof LEGEND)[number]> = {
  title: 'namespace',
  link: 'function',
  projectLink: 'function',
  externalLink: 'string',
  icon: 'function',
  image: 'string',
  hashtag: 'decorator',
  code: 'string',
  codeBlock: 'string',
  formula: 'number',
  table: 'property',
  quote: 'comment',
  frontmatter: 'comment',
  component: 'type',
  bold: 'keyword',
  bold2: 'keyword',
  bold3: 'keyword',
  italic: 'macro',
  strike: 'comment',
  underline: 'variable',
}

const LEGEND_INDEX: ReadonlyMap<string, number> = new Map(
  LEGEND.map((type, index) => [type, index]),
)

/** Leaf inline nodes that map 1:1. Each sits on one line, so no splitting is needed. */
const INLINE_TOKEN_TYPE: Partial<Record<AnyNodeType, TokenType>> = {
  internalLink: 'link',
  externalLink: 'externalLink',
  projectLink: 'projectLink',
  hashtag: 'hashtag',
  inlineCode: 'code',
  image: 'image',
  icon: 'icon',
  formula: 'formula',
}

const spanToken = (type: TokenType, position: Position): RawToken => ({
  line: position.start.line,
  char: position.start.column,
  length: position.end.column - position.start.column,
  type,
})

// Cosense sizes emphasis by asterisk count (`[*]`..`[*****]`); sizeLevel is 0-indexed.
const boldTokenType = (sizeLevel: number): TokenType =>
  sizeLevel >= 2 ? 'bold3' : sizeLevel === 1 ? 'bold2' : 'bold'

/** Every decoration a run carries, since Cosense applies all of them: `[-* x]` is both. */
const decorationTokenTypes = (node: Decoration): TokenType[] => {
  const types: TokenType[] = []
  if (node.underline) types.push('underline')
  if (node.strike) types.push('strike')
  if (node.italic) types.push('italic')
  if (node.bold) types.push(boldTokenType(node.sizeLevel))
  return types
}

/** How many characters of `>` and spaces open a quote line, from `indent` onwards. */
const quoteMarkerLength = (lineText: string, indent: number): number => {
  let i = indent
  while (i < lineText.length && (lineText[i] === '>' || lineText[i] === ' ')) i++
  return i - indent
}

const COMPONENT_LINE = /^\s*<\/?[A-Z][A-Za-z0-9_.]*(\s|\/?>)/

/** The `---` fenced YAML at the very top, as [firstLine, lastLine] of the fence itself. */
const frontmatterRange = (lines: readonly string[]): [number, number] | undefined => {
  if (lines[0]?.trim() !== '---') return undefined
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') return [0, i]
  }
  return undefined
}

export interface ComputeTokensOptions {
  /** `.csnx` also reads a line that is one component tag. `.csn` never does. */
  readonly components?: boolean
}

/** Pure text -> tokens. The LSP delta encoding lives in encodeTokens, so this stays testable. */
export const computeTokens = (text: string, options: ComputeTokensOptions = {}): RawToken[] => {
  const normalized = normalizeLineEndings(text)
  const docLines = normalized.split('\n')
  const tokens: RawToken[] = []

  const pushLineSpan = (type: TokenType, startLine: number, endLine: number): void => {
    for (let line = startLine; line <= endLine; line++) {
      const lineText = docLines[line] ?? ''
      if (lineText.length > 0) tokens.push({ line, char: 0, length: lineText.length, type })
    }
  }

  // Frontmatter is YAML, so the Cosense parser must not see it: `---` would otherwise read
  // as a strikethrough marker and the keys as plain text on the title line.
  const fence = frontmatterRange(docLines)
  let body = normalized
  let offset = 0
  if (fence) {
    pushLineSpan('frontmatter', fence[0], fence[1])
    offset = fence[1] + 1
    body = docLines.slice(offset).join('\n')
  }

  const page = parse(body)
  visit(page, (node: AnyNode) => {
    const shift = (position: Position): Position => ({
      start: { ...position.start, line: position.start.line + offset },
      end: { ...position.end, line: position.end.line + offset },
    })
    switch (node.type) {
      case 'title':
        tokens.push(spanToken('title', shift(node.position)))
        return 'skip'
      case 'codeBlock':
        pushLineSpan('codeBlock', node.position.start.line + offset, node.position.end.line + offset)
        return 'skip'
      case 'table':
        pushLineSpan('table', node.position.start.line + offset, node.position.end.line + offset)
        return 'skip'
      case 'line': {
        const line = node.position.start.line + offset
        const lineText = docLines[line] ?? ''
        // A component tag owns its whole line, so nothing inside it is Cosense notation.
        if (options.components && COMPONENT_LINE.test(lineText)) {
          if (lineText.length > 0) {
            tokens.push({ line, char: 0, length: lineText.length, type: 'component' })
          }
          return 'skip'
        }
        if (node.quote) {
          const marker = quoteMarkerLength(lineText, node.indent)
          if (marker > 0) tokens.push({ line, char: node.indent, length: marker, type: 'quote' })
        }
        return undefined
      }
      case 'decoration': {
        for (const type of decorationTokenTypes(node)) {
          tokens.push(spanToken(type, shift(node.position)))
        }
        // Descend: a decoration can wrap a link or an image (`[* [page]]`), and that child
        // needs its own token over the same span.
        return undefined
      }
      default: {
        const mapped = INLINE_TOKEN_TYPE[node.type]
        if (mapped) tokens.push(spanToken(mapped, shift(node.position)))
        return undefined
      }
    }
  })

  return tokens.filter((t) => t.length > 0).sort((a, b) => a.line - b.line || a.char - b.char)
}

/** LSP relative encoding: [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]*. */
export const encodeTokens = (tokens: readonly RawToken[]): number[] => {
  const sorted = [...tokens].sort((a, b) => a.line - b.line || a.char - b.char)
  const data: number[] = []
  let prevLine = 0
  let prevChar = 0
  for (const token of sorted) {
    const deltaLine = token.line - prevLine
    const deltaStartChar = deltaLine === 0 ? token.char - prevChar : token.char
    data.push(deltaLine, deltaStartChar, token.length, LEGEND_INDEX.get(LSP_TYPE[token.type]) ?? 0, 0)
    prevLine = token.line
    prevChar = token.char
  }
  return data
}
