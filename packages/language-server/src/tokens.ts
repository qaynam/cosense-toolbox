import type {
  AnyNode,
  AnyNodeType,
  Decoration,
  NodeOfType,
  Position,
} from '@cosense-toolbox/parser'
import { normalizeLineEndings, parse } from '@cosense-toolbox/parser'
import { visit } from '@cosense-toolbox/parser/utils'
import { Array as Arr, Match, Option, Order, Record as Rec, pipe } from 'effect'

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
  // `.csnx` only: a line that opens with a component tag. The tag's name, its attribute
  // names, and the two kinds of value, as JSX reads them.
  'component',
  'attribute',
  'attributeValue',
  'expression',
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
  attribute: 'parameter',
  attributeValue: 'string',
  expression: 'variable',
  bold: 'keyword',
  bold2: 'keyword',
  bold3: 'keyword',
  italic: 'macro',
  strike: 'comment',
  underline: 'variable',
}

/** Each notation's place in LEGEND: the number that goes on the wire. */
const LEGEND_INDEX: { readonly [T in TokenType]: number } = Rec.map(LSP_TYPE, (type) =>
  LEGEND.indexOf(type),
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

/** Top to bottom, then left to right: the order the LSP encoding needs. */
const BY_POSITION: Order.Order<RawToken> = Order.combine(
  Order.mapInput(Order.number, (token: RawToken) => token.line),
  Order.mapInput(Order.number, (token: RawToken) => token.char),
)

const onlyIf = <A>(condition: boolean, value: A): Option.Option<A> =>
  condition ? Option.some(value) : Option.none()

/** A token over `[from, to)` of one line. */
const token = (type: TokenType, line: number, from: number, to: number): RawToken => ({
  line,
  char: from,
  length: to - from,
  type,
})

const spanToken = (type: TokenType, position: Position): RawToken =>
  token(type, position.start.line, position.start.column, position.end.column)

/** How many characters from `from` the `^`-anchored `pattern` takes; 0 when it takes none. */
const matchLength = (pattern: RegExp, text: string, from: number): number =>
  pipe(
    Option.fromNullable(pattern.exec(text.slice(from))),
    Option.match({ onNone: () => 0, onSome: ([matched]) => matched.length }),
  )

// --- Emphasis ---------------------------------------------------------------------------

/** Cosense sizes emphasis by asterisk count (`[*]`..`[*****]`); sizeLevel is 0-indexed. */
const boldTokenType = (sizeLevel: number): TokenType =>
  Match.value(sizeLevel).pipe(
    Match.when(
      (level) => level >= 2,
      (): TokenType => 'bold3',
    ),
    Match.when(1, (): TokenType => 'bold2'),
    Match.orElse((): TokenType => 'bold'),
  )

/** Every decoration a run carries, since Cosense applies all of them: `[-* x]` is both. */
const decorationTokenTypes = (node: Decoration): ReadonlyArray<TokenType> =>
  Arr.getSomes([
    onlyIf(node.underline, 'underline' as const),
    onlyIf(node.strike, 'strike' as const),
    onlyIf(node.italic, 'italic' as const),
    onlyIf(node.bold, boldTokenType(node.sizeLevel)),
  ])

// --- Component lines (`.csnx`) ----------------------------------------------------------

const COMPONENT_LINE = /^\s*<\/?[A-Z][A-Za-z0-9_.]*(\s|\/?>)/
const TAG_OPEN = /^(\s*<\/?)([A-Z][A-Za-z0-9_.]*)/
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*/
const SPACE = /^\s*/

/** Where a quoted value opened at `from` ends: after its closing quote, or at the line's end. */
const quotedEnd = (text: string, from: number): number =>
  pipe(
    text.indexOf(text.charAt(from), from + 1),
    Option.liftPredicate((close) => close >= 0),
    Option.match({ onNone: () => text.length, onSome: (close) => close + 1 }),
  )

/** Where `{ ... }` opened at `from` ends, counting nested braces: after its `}`, or the line's end. */
const bracedEnd = (text: string, from: number): number =>
  pipe(
    text.slice(from).split(''),
    Arr.scan(0, (depth, char) => (char === '{' ? depth + 1 : char === '}' ? depth - 1 : depth)),
    // scan starts with the depth before any character; the rest line up with the characters.
    Arr.drop(1),
    Arr.findFirstIndex((depth) => depth === 0),
    Option.match({ onNone: () => text.length, onSome: (index) => from + index + 1 }),
  )

type ValueType = 'attributeValue' | 'expression'

/** The attribute value that starts at `from`: its type and where it ends. */
const valueAt = (text: string, from: number): Option.Option<readonly [ValueType, number]> =>
  Match.value(text.charAt(from)).pipe(
    Match.when(
      (char) => char === '"' || char === "'",
      () => Option.some(['attributeValue', quotedEnd(text, from)] as const),
    ),
    Match.when('{', () => Option.some(['expression', bracedEnd(text, from)] as const)),
    Match.orElse(() => Option.none()),
  )

/** The tokens of one attribute and where the next may start, or None once the tag has closed. */
type AttributeStep = Option.Option<readonly [ReadonlyArray<RawToken>, number]>

const attributeStep =
  (line: number, text: string) =>
  (from: number): AttributeStep => {
    const at = from + matchLength(SPACE, text, from)
    if (at >= text.length || text.startsWith('>', at) || text.startsWith('/>', at)) {
      return Option.none()
    }
    const nameEnd = at + matchLength(ATTRIBUTE_NAME, text, at)
    // Not a name: step over the character, since the tag may still go on after it.
    if (nameEnd === at) return Option.some([[], at + 1])

    const name = token('attribute', line, at, nameEnd)
    const afterName = nameEnd + matchLength(SPACE, text, nameEnd)
    if (text.charAt(afterName) !== '=') return Option.some([[name], afterName])

    const valueStart = afterName + 1 + matchLength(SPACE, text, afterName + 1)
    return pipe(
      valueAt(text, valueStart),
      Option.match({
        onNone: () => [[name], valueStart] as const,
        onSome: ([type, end]) => [[name, token(type, line, valueStart, end)], end] as const,
      }),
      Option.some,
    )
  }

/**
 * The tag that opens a component line, read as JSX: its name, then each attribute and its
 * value, up to the `>` that closes it. Text after the tag is left alone; it is neither
 * Cosense notation nor part of the tag.
 */
const componentTokens = (line: number, text: string): ReadonlyArray<RawToken> =>
  pipe(
    Option.fromNullable(TAG_OPEN.exec(text)),
    Option.map(([head, lead = '', name = '']) => [
      token('component', line, lead.length, lead.length + name.length),
      ...Arr.flatten(Arr.unfold(head.length, attributeStep(line, text))),
    ]),
    Option.getOrElse(() => []),
  )

// --- The page ---------------------------------------------------------------------------

/** The last line of the `---` fence around YAML at the very top, if the file opens with one. */
const frontmatterEnd = (lines: ReadonlyArray<string>): Option.Option<number> =>
  pipe(
    Option.liftPredicate(lines, (all) => all[0]?.trim() === '---'),
    Option.flatMap(Arr.findFirstIndex((line, index) => index > 0 && line.trim() === '---')),
  )

/** What the node visitor needs to know about the file around the parsed body. */
interface Page {
  readonly lines: ReadonlyArray<string>
  /** Lines before the body: the frontmatter, which the parser never sees. */
  readonly offset: number
  readonly components: boolean
}

/** Each non-empty line from `first` to `last`, whole. */
const lineSpans = (
  type: TokenType,
  lines: ReadonlyArray<string>,
  first: number,
  last: number,
): ReadonlyArray<RawToken> =>
  Arr.filterMap(Arr.range(first, last), (line) =>
    pipe(
      Option.fromNullable(lines[line]),
      Option.filter((text) => text.length > 0),
      Option.map((text) => token(type, line, 0, text.length)),
    ),
  )

/** The line's text, when the file reads components and the line opens with a tag. */
const componentLine = (page: Page, line: number): Option.Option<string> =>
  pipe(
    Option.fromNullable(page.lines[line]),
    Option.filter((text) => page.components && COMPONENT_LINE.test(text)),
  )

/** The `>` and spaces that open a quote line, from its indentation onwards. */
const quoteToken = (page: Page, node: NodeOfType<'line'>, line: number): Option.Option<RawToken> =>
  pipe(
    onlyIf(node.quote, page.lines[line] ?? ''),
    Option.map((text) => matchLength(/^[> ]*/, text, node.indent)),
    Option.filter((length) => length > 0),
    Option.map((length) => token('quote', line, node.indent, node.indent + length)),
  )

/** What one node contributes, and whether the visitor goes on into its children. */
interface NodeTokens {
  readonly tokens: ReadonlyArray<RawToken>
  readonly descend: boolean
}

const leaf = (tokens: ReadonlyArray<RawToken>): NodeTokens => ({ tokens, descend: false })

const branch = (tokens: ReadonlyArray<RawToken>): NodeTokens => ({ tokens, descend: true })

const nodeTokens =
  (page: Page) =>
  (node: AnyNode): NodeTokens => {
    const lineOf = (position: Position) => position.start.line + page.offset
    const shift = (position: Position): Position => ({
      start: { ...position.start, line: position.start.line + page.offset },
      end: { ...position.end, line: position.end.line + page.offset },
    })
    return Match.value(node).pipe(
      Match.discriminators('type')({
        // A page that opens with a component has no title line: the tag is what it is.
        title: (title) =>
          leaf(
            pipe(
              componentLine(page, lineOf(title.position)),
              Option.match({
                onNone: () => [spanToken('title', shift(title.position))],
                onSome: (text) => componentTokens(lineOf(title.position), text),
              }),
            ),
          ),
        codeBlock: (block) =>
          leaf(
            lineSpans(
              'codeBlock',
              page.lines,
              lineOf(block.position),
              block.position.end.line + page.offset,
            ),
          ),
        table: (table) =>
          leaf(
            lineSpans(
              'table',
              page.lines,
              lineOf(table.position),
              table.position.end.line + page.offset,
            ),
          ),
        // A component tag owns its line, so nothing on it is Cosense notation.
        line: (line) =>
          pipe(
            componentLine(page, lineOf(line.position)),
            Option.match({
              onSome: (text) => leaf(componentTokens(lineOf(line.position), text)),
              onNone: () => branch(Option.toArray(quoteToken(page, line, lineOf(line.position)))),
            }),
          ),
        // Descend: a decoration can wrap a link or an image (`[* [page]]`), and that child
        // needs its own token over the same span.
        decoration: (decoration) =>
          branch(
            decorationTokenTypes(decoration).map((type) =>
              spanToken(type, shift(decoration.position)),
            ),
          ),
      }),
      Match.orElse((other) =>
        branch(
          pipe(
            Option.fromNullable(INLINE_TOKEN_TYPE[other.type]),
            Option.map((type) => spanToken(type, shift(other.position))),
            Option.toArray,
          ),
        ),
      ),
    )
  }

export interface ComputeTokensOptions {
  /** `.csnx` also reads a line that is one component tag. `.csn` never does. */
  readonly components?: boolean
}

/** Pure text -> tokens. The LSP delta encoding lives in encodeTokens, so this stays testable. */
export const computeTokens = (text: string, options: ComputeTokensOptions = {}): RawToken[] => {
  const lines = normalizeLineEndings(text).split('\n')
  // Frontmatter is YAML, so the Cosense parser must not see it: `---` would otherwise read
  // as a strikethrough marker and the keys as plain text on the title line.
  const fence = frontmatterEnd(lines)
  const page: Page = {
    lines,
    offset: Option.match(fence, { onNone: () => 0, onSome: (end) => end + 1 }),
    components: options.components ?? false,
  }

  const tokens: RawToken[] = Option.match(fence, {
    onNone: () => [],
    onSome: (end) => [...lineSpans('frontmatter', lines, 0, end)],
  })
  const tokensOf = nodeTokens(page)
  visit(parse(lines.slice(page.offset).join('\n')), (node) => {
    const { tokens: own, descend } = tokensOf(node)
    tokens.push(...own)
    return descend ? undefined : 'skip'
  })

  return pipe(
    tokens,
    Arr.filter((t) => t.length > 0),
    Arr.sort(BY_POSITION),
  )
}

/** LSP relative encoding: [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]*. */
export const encodeTokens = (tokens: ReadonlyArray<RawToken>): number[] =>
  pipe(
    Arr.sort(tokens, BY_POSITION),
    Arr.mapAccum({ line: 0, char: 0 }, (previous, t) => [
      { line: t.line, char: t.char },
      [
        t.line - previous.line,
        t.line === previous.line ? t.char - previous.char : t.char,
        t.length,
        LEGEND_INDEX[t.type],
        0,
      ],
    ]),
    ([, rows]) => Arr.flatten(rows),
  )
