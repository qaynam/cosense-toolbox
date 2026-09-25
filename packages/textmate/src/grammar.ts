/**
 * The Cosense grammar, built from code rather than written as JSON: emphasis alone takes
 * one rule per combination of markers, and those are generated.
 *
 * The rules follow @cosense-toolbox/parser, and where they cannot (TextMate reads line by
 * line with regexes, the parser reads the whole page) they approximate it. The parity test
 * measures how close that is against the language server.
 */
import { SCOPES } from './scopes'

/** The subset of a TextMate rule this grammar uses. Assignable to Shiki's and VS Code's types. */
export interface Rule {
  name?: string
  match?: string
  begin?: string
  end?: string
  captures?: Record<string, Rule>
  beginCaptures?: Record<string, Rule>
  endCaptures?: Record<string, Rule>
  patterns?: Rule[]
  include?: string
  applyEndPatternLast?: boolean
}

/** A grammar as Shiki takes it (`LanguageRegistration`), which is also a `.tmLanguage.json`. */
export interface Grammar {
  name: string
  displayName: string
  scopeName: string
  aliases: string[]
  fileTypes: string[]
  patterns: Rule[]
  repository: Record<string, Rule>
}

const raw = String.raw

/** Indentation, as the parser counts it: full-width spaces indent too. */
const INDENT = raw`[ \t　]*`

const IMAGE_EXT = raw`\.(?i:png|jpe?g|gif|webp|svg|bmp|avif)`

/**
 * A URL that is drawn as an image, inside a bracket (so without `[`, `]` or spaces):
 * a Gyazo page, a path ending in an image extension before any query, or a fragment
 * ending in one (`#.svg`, Cosense's way of saying "this is an image").
 */
const IMAGE_URL = [
  raw`(?i:https?://(?:i\.)?gyazo\.com/[0-9a-f]{20,})[^\s\[\]]*`,
  raw`(?i:https?)://[^\s\[\]?#]*${IMAGE_EXT}(?:[?#][^\s\[\]]*)?`,
  raw`(?i:https?)://[^\s\[\]#]*#[^\s\[\]]*${IMAGE_EXT}`,
]
  .map((alternative) => `(?:${alternative})`)
  .join('|')

const URL = raw`(?i:https?)://[^\s\[\]]+`

/** What a bracket must end with somewhere, or it is plain text and not worth a rule. */
const CLOSES = raw`(?=.*\])`

const MARKERS = raw`[*/\-_]`

interface Emphasis {
  readonly stars: 0 | 1 | 2 | 3
  readonly italic: boolean
  readonly strike: boolean
  readonly underline: boolean
}

/** Every combination of markers that means something: 4 weights x 3 switches, minus none. */
const emphases = (): Emphasis[] =>
  ([0, 1, 2, 3] as const).flatMap((stars) =>
    [false, true].flatMap((italic) =>
      [false, true].flatMap((strike) =>
        [false, true].flatMap((underline) =>
          stars === 0 && !italic && !strike && !underline
            ? []
            : [{ stars, italic, strike, underline }],
        ),
      ),
    ),
  )

/** Lookaheads over the marker run (`[-** x]` -> `-**`) that hold only for this combination. */
const markerConditions = (emphasis: Emphasis): string => {
  const has = (marker: string, wanted: boolean) =>
    wanted ? raw`(?=${MARKERS}*?${marker})` : raw`(?!${MARKERS}*?${marker})`
  const notStar = raw`[/\-_]`
  const stars =
    emphasis.stars === 0
      ? raw`(?!${MARKERS}*?\*)`
      : emphasis.stars === 3
        ? raw`(?=(?:${notStar}*\*){3})`
        : raw`(?=(?:${notStar}*\*){${emphasis.stars}}${notStar}*\s)`
  return [
    stars,
    has('/', emphasis.italic),
    has(raw`\-`, emphasis.strike),
    has('_', emphasis.underline),
  ].join('')
}

/** All the scopes a run carries, since Cosense applies every marker: `[-* x]` is both. */
const emphasisScope = (emphasis: Emphasis): string =>
  [
    emphasis.underline && SCOPES.underline,
    emphasis.strike && SCOPES.strike,
    emphasis.italic && SCOPES.italic,
    emphasis.stars === 1 && SCOPES.bold,
    emphasis.stars === 2 && SCOPES.bold2,
    emphasis.stars === 3 && SCOPES.bold3,
  ]
    .filter(Boolean)
    .join(' ')

/**
 * `[<markers> body]`. The body is read again for links and icons but not for emphasis,
 * which does not nest in Cosense (`[* [* x]]` is bold around a link).
 */
const emphasisRule = (emphasis: Emphasis): Rule => ({
  name: emphasisScope(emphasis),
  begin: raw`\[${markerConditions(emphasis)}(?=${MARKERS}+\s.*\])${MARKERS}+\s+`,
  // A bracket closes on its own line or not at all.
  end: raw`\]|(?=$)`,
  patterns: [{ include: '#inline-in-emphasis' }, { include: '#nested-bracket' }],
})

/** `[[x]]`: an image when x is one, bold otherwise. Closes on the first `]]`, depth or not. */
const strongRules: Rule[] = [
  {
    name: SCOPES.image,
    match: raw`\[\[(?:${IMAGE_URL}|(?:(?!\]\]).)*?${IMAGE_EXT}(?:[?#](?:(?!\]\]).)*)?)\]\]`,
  },
  {
    name: SCOPES.bold,
    match: raw`\[\[((?:(?!\]\]).)+)\]\]`,
    captures: { 1: { patterns: [{ include: '#inline-in-emphasis' }] } },
  },
]

/** `[$ x^2]`. Its body is TeX, not notation, and may hold brackets of its own. */
const formulaRule: Rule = {
  name: SCOPES.formula,
  begin: raw`\[(?=\$)${CLOSES}`,
  end: raw`\]|(?=$)`,
  patterns: [{ include: '#bare-bracket' }],
}

/**
 * Brackets whose body holds no brackets, tried in the parser's order: an icon before a
 * URL before an image path before a project link, and anything left is a page link.
 */
const simpleTargetRules = (allowImagePath: boolean): Rule[] => [
  { name: SCOPES.icon, match: raw`\[[^\[\]]+\.icon(?:\*\d+)?\]` },
  // Only URLs, and one of them an image: the image, linking to another URL if there is one.
  {
    name: SCOPES.image,
    match: raw`\[\s*(?:${URL}\s+)*(?:${IMAGE_URL})(?=[\s\]])(?:\s+${URL})*\s*\]`,
  },
  // Any other URL makes a link, labelled or not.
  { name: SCOPES.externalLink, match: raw`\[[^\[\]]*${URL}[^\[\]]*\]` },
  // `[a.png]`, but not inside emphasis: there Cosense links to a page of that name.
  ...(allowImagePath ? [{ name: SCOPES.image, match: raw`\[[^\[\]]*${IMAGE_EXT}\]` }] : []),
  { name: SCOPES.projectLink, match: raw`\[/[^\[\]]*\]` },
  { name: SCOPES.link, match: raw`\[(?=[^\[\]]*[^\s\[\]])[^\[\]]+\]` },
]

const inlineCode: Rule = { name: SCOPES.code, match: '`[^`]*`' }

/** `#tag`, only at the start or after a space: a `#` inside a word is just a character. */
const hashtag: Rule = { name: SCOPES.hashtag, match: raw`(?:^|(?<=[ \t　]))#[^\s\[\]#]+` }

/** A URL outside brackets is always a link, even to an image. */
const bareUrl: Rule = { name: SCOPES.externalLink, match: raw`(?i:https?)://[^\s\]]+` }

/**
 * A bracket that is no notation, but whose `]` must not close the one around it:
 * in `[* a [] b]` the emphasis runs to the last `]`, as the parser counts depth.
 */
const nestedBracket = (inner: string): Rule => ({
  begin: raw`\[`,
  end: raw`\]|(?=$)`,
  patterns: [{ include: inner }, { include: '#nested-bracket' }],
})

const blockHeader = (keyword: string, scope: string): Rule => ({
  name: scope,
  // A block is its header and every line indented deeper. Deeper is approximated as
  // "the header's indentation, then more", which is exact when a page indents one way.
  begin: raw`^(${INDENT})(${keyword}:)(.+)$`,
  beginCaptures: {
    2: { name: 'keyword.other.block.cosense' },
    3: { name: 'entity.name.section.block.cosense' },
  },
  end: raw`^(?!\1[ \t　])`,
})

export interface BuildOptions {
  /** `.csnx`: also read a line that is one component tag (`<Callout type="warn">`). */
  readonly components: boolean
}

export const buildGrammar = (options: BuildOptions): Grammar => {
  const lineRules = [
    '#code-block',
    '#table-block',
    ...(options.components ? ['#component'] : []),
    '#quote',
    '#inline',
  ].map((include) => ({ include }))

  return {
    name: options.components ? 'cosense-x' : 'cosense',
    displayName: options.components ? 'Cosense X' : 'Cosense',
    scopeName: options.components ? 'text.cosense-x' : 'text.cosense',
    aliases: [options.components ? 'csnx' : 'csn'],
    fileTypes: [options.components ? 'csnx' : 'csn'],
    patterns: [{ include: '#head' }, ...lineRules],
    repository: {
      // The first line is the title, unless the file opens with YAML: then it is the
      // first line after the fence. Nothing on the title line is notation.
      head: {
        patterns: [
          {
            begin: raw`\A(?=---[ \t]*$)`,
            patterns: [{ include: '#frontmatter' }],
            end: raw`^(.*)$`,
            endCaptures: { 1: { name: SCOPES.title } },
            // At the very start the fence and the title line both match: the fence wins.
            applyEndPatternLast: true,
          },
          { name: SCOPES.title, match: raw`\A.*$` },
        ],
      },
      frontmatter: {
        name: SCOPES.frontmatter,
        begin: raw`\A---[ \t]*$`,
        end: raw`^---[ \t]*$`,
      },
      'code-block': blockHeader('code', SCOPES.codeBlock),
      'table-block': {
        ...blockHeader('table', SCOPES.table),
        patterns: [{ name: 'punctuation.separator.table-cell.cosense', match: raw`\t` }],
      },
      // A component tag owns its line: nothing on it is Cosense notation.
      component: {
        name: SCOPES.component,
        match: raw`^\s*(</?)([A-Z][A-Za-z0-9_.]*)(?=\s|/?>).*$`,
        captures: {
          1: { name: 'punctuation.definition.tag.begin.cosense' },
          2: { name: 'support.class.component.cosense' },
        },
      },
      quote: {
        name: 'markup.quote.cosense',
        begin: raw`^${INDENT}(>[> ]*)`,
        beginCaptures: { 1: { name: SCOPES.quote } },
        end: '$',
        patterns: [{ include: '#inline' }],
      },
      inline: {
        patterns: [
          ...strongRules,
          formulaRule,
          ...emphases().map(emphasisRule),
          ...simpleTargetRules(true),
          inlineCode,
          hashtag,
          bareUrl,
        ],
      },
      'inline-in-emphasis': {
        patterns: [
          ...strongRules,
          formulaRule,
          ...simpleTargetRules(false),
          inlineCode,
          hashtag,
          bareUrl,
        ],
      },
      'nested-bracket': nestedBracket('#inline-in-emphasis'),
      'bare-bracket': {
        begin: raw`\[`,
        end: raw`\]|(?=$)`,
        patterns: [{ include: '#bare-bracket' }],
      },
    },
  }
}
