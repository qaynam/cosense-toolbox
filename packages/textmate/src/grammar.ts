/**
 * The Cosense grammar, built from code rather than written as JSON: emphasis alone takes
 * one rule per combination of markers, and those are generated.
 *
 * The rules follow @cosense-toolbox/parser, and where they cannot (TextMate reads line by
 * line with regexes, the parser reads the whole page) they approximate it. The parity test
 * measures how close that is against the language server.
 *
 * Rules are first built as a tagged union (`Pattern`) and only then encoded as TextMate
 * JSON. The union is what keeps the grammar honest: a rule is a match or a region and never
 * half of each, every `include` names a repository entry that exists, and every scope ends
 * in `.cosense`. A typo in any of those fails to compile instead of silently colouring nothing.
 */
import { Array as Arr, Brand, Match, Option, Record as Rec, pipe } from 'effect'
import { SCOPES, type Scope } from './scopes'

// --- The output: what Shiki and VS Code read ------------------------------------------

/** A TextMate rule as JSON. Assignable to Shiki's and VS Code's own types. */
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
  name: Dialect
  displayName: string
  scopeName: `text.${Dialect}`
  aliases: string[]
  fileTypes: string[]
  patterns: Rule[]
  repository: Record<string, Rule>
}

// --- Regexes ----------------------------------------------------------------------------

/** A regex in Oniguruma syntax. Branded so a scope or a label cannot be passed as one. */
type Regex = string & Brand.Brand<'Regex'>
const Regex = Brand.nominal<Regex>()

/** A regex written raw: backslashes are the regex's, not the string literal's. */
const re = (strings: TemplateStringsArray, ...parts: ReadonlyArray<Regex | number>): Regex =>
  Regex(String.raw(strings, ...parts))

const oneOf = (alternatives: Arr.NonEmptyReadonlyArray<Regex>): Regex =>
  Regex(alternatives.map((alternative) => `(?:${alternative})`).join('|'))

/** Indentation, as the parser counts it: full-width spaces indent too. */
const INDENT = re`[ \t　]*`

const IMAGE_EXT = re`\.(?i:png|jpe?g|gif|webp|svg|bmp|avif)`

/**
 * A URL that is drawn as an image, inside a bracket (so without `[`, `]` or spaces):
 * a Gyazo page, a path ending in an image extension before any query, or a fragment
 * ending in one (`#.svg`, Cosense's way of saying "this is an image").
 */
const IMAGE_URL = oneOf([
  re`(?i:https?://(?:i\.)?gyazo\.com/[0-9a-f]{20,})[^\s\[\]]*`,
  re`(?i:https?)://[^\s\[\]?#]*${IMAGE_EXT}(?:[?#][^\s\[\]]*)?`,
  re`(?i:https?)://[^\s\[\]#]*#[^\s\[\]]*${IMAGE_EXT}`,
])

const URL = re`(?i:https?)://[^\s\[\]]+`

/** What a bracket must end with somewhere, or it is plain text and not worth a rule. */
const CLOSES = re`(?=.*\])`

/** A bracket closes on its own line or not at all. */
const CLOSE_ON_LINE = re`\]|(?=$)`

const MARKERS = re`[*/\-_]`

const NOT_STAR = re`[/\-_]`

// --- Rules, typed -----------------------------------------------------------------------

type RepositoryKey =
  | 'head'
  | 'frontmatter'
  | 'code-block'
  | 'table-block'
  | 'component'
  | 'quote'
  | 'inline'
  | 'inline-in-emphasis'
  | 'nested-bracket'
  | 'bare-bracket'

/** Capture groups are numbered from 1; this grammar never needs more than three. */
type CaptureGroup = '1' | '2' | '3'

interface Capture {
  readonly scopes: ReadonlyArray<Scope>
  readonly patterns: ReadonlyArray<Pattern>
}

type Captures = Readonly<Partial<Record<CaptureGroup, Capture>>>

interface Include {
  readonly _tag: 'Include'
  readonly key: RepositoryKey
}

/** A single-line match. */
interface Single {
  readonly _tag: 'Single'
  readonly scopes: ReadonlyArray<Scope>
  readonly regex: Regex
  readonly captures: Captures
}

/** From `begin` to `end`, with `patterns` tried in between. */
interface Region {
  readonly _tag: 'Region'
  readonly scopes: ReadonlyArray<Scope>
  readonly begin: Regex
  readonly end: Regex
  readonly beginCaptures: Captures
  readonly endCaptures: Captures
  readonly patterns: ReadonlyArray<Pattern>
  /** Try `patterns` before `end` when both match at the same place. */
  readonly endPatternLast: boolean
}

/** Several patterns tried in order, with no scope of their own. */
interface Group {
  readonly _tag: 'Group'
  readonly patterns: ReadonlyArray<Pattern>
}

type Pattern = Include | Single | Region | Group

const include = (key: RepositoryKey): Pattern => ({ _tag: 'Include', key })

const single = (
  regex: Regex,
  options: { readonly scopes?: ReadonlyArray<Scope>; readonly captures?: Captures } = {},
): Pattern => ({
  _tag: 'Single',
  regex,
  scopes: options.scopes ?? [],
  captures: options.captures ?? {},
})

const region = (options: {
  readonly begin: Regex
  readonly end: Regex
  readonly scopes?: ReadonlyArray<Scope>
  readonly beginCaptures?: Captures
  readonly endCaptures?: Captures
  readonly patterns?: ReadonlyArray<Pattern>
  readonly endPatternLast?: boolean
}): Pattern => ({
  _tag: 'Region',
  begin: options.begin,
  end: options.end,
  scopes: options.scopes ?? [],
  beginCaptures: options.beginCaptures ?? {},
  endCaptures: options.endCaptures ?? {},
  patterns: options.patterns ?? [],
  endPatternLast: options.endPatternLast ?? false,
})

const group = (patterns: ReadonlyArray<Pattern>): Pattern => ({ _tag: 'Group', patterns })

const scoped = (...scopes: ReadonlyArray<Scope>): Capture => ({ scopes, patterns: [] })

const readAs = (...patterns: ReadonlyArray<Pattern>): Capture => ({ scopes: [], patterns })

const onlyIf = <A>(condition: boolean, value: A): Option.Option<A> =>
  condition ? Option.some(value) : Option.none()

// --- Inline notation --------------------------------------------------------------------

type Weight = 0 | 1 | 2 | 3

/** One combination of emphasis markers: how many `*`, and which of `/`, `-`, `_`. */
interface Emphasis {
  readonly stars: Weight
  readonly italic: boolean
  readonly strike: boolean
  readonly underline: boolean
}

const WEIGHTS: ReadonlyArray<Weight> = [0, 1, 2, 3]

const SWITCHES = [false, true] as const

/** Every combination of markers, including none at all (which `emphasisRules` drops). */
const MARKER_SETS: ReadonlyArray<Emphasis> = pipe(
  WEIGHTS,
  Arr.flatMap((stars) => Arr.map(SWITCHES, (italic) => ({ stars, italic }))),
  Arr.flatMap((set) => Arr.map(SWITCHES, (strike) => ({ ...set, strike }))),
  Arr.flatMap((set) => Arr.map(SWITCHES, (underline) => ({ ...set, underline }))),
)

/** `[*** x]` and louder are one size: Cosense caps the size, and so does the parser. */
const WEIGHT_SCOPE: { readonly [W in Weight]: Option.Option<Scope> } = {
  0: Option.none(),
  1: Option.some(SCOPES.bold),
  2: Option.some(SCOPES.bold2),
  3: Option.some(SCOPES.bold3),
}

/** All the scopes a run carries, since Cosense applies every marker: `[-* x]` is both. */
const emphasisScopes = (emphasis: Emphasis): ReadonlyArray<Scope> =>
  Arr.getSomes([
    onlyIf(emphasis.underline, SCOPES.underline),
    onlyIf(emphasis.strike, SCOPES.strike),
    onlyIf(emphasis.italic, SCOPES.italic),
    WEIGHT_SCOPE[emphasis.stars],
  ])

/** A lookahead over the marker run (`[-** x]` -> `-**`) that holds for exactly this many `*`. */
const starCondition = (stars: Weight): Regex =>
  Match.value(stars).pipe(
    Match.when(0, () => re`(?!${MARKERS}*?\*)`),
    Match.when(3, () => re`(?=(?:${NOT_STAR}*\*){3})`),
    Match.orElse((count) => re`(?=(?:${NOT_STAR}*\*){${count}}${NOT_STAR}*\s)`),
  )

const markerCondition = (marker: Regex, wanted: boolean): Regex =>
  wanted ? re`(?=${MARKERS}*?${marker})` : re`(?!${MARKERS}*?${marker})`

/** Lookaheads over the marker run that hold only for this combination. */
const markerConditions = (emphasis: Emphasis): Regex =>
  Regex(
    [
      starCondition(emphasis.stars),
      markerCondition(re`/`, emphasis.italic),
      markerCondition(re`\-`, emphasis.strike),
      markerCondition(re`_`, emphasis.underline),
    ].join(''),
  )

/**
 * `[<markers> body]`, one rule per combination. The body is read again for links and icons
 * but not for emphasis, which does not nest in Cosense (`[* [* x]]` is bold around a link).
 */
const emphasisRules: ReadonlyArray<Pattern> = Arr.filterMap(MARKER_SETS, (emphasis) =>
  pipe(
    emphasisScopes(emphasis),
    Option.liftPredicate((scopes) => scopes.length > 0),
    Option.map((scopes) =>
      region({
        scopes,
        begin: re`\[${markerConditions(emphasis)}(?=${MARKERS}+\s.*\])${MARKERS}+\s+`,
        end: CLOSE_ON_LINE,
        patterns: [include('inline-in-emphasis'), include('nested-bracket')],
      }),
    ),
  ),
)

/** Anything up to, but not over, a `]]`. */
const UNTIL_DOUBLE_CLOSE = re`(?:(?!\]\]).)`

/** `[[x]]`: an image when x is one, bold otherwise. Closes on the first `]]`, depth or not. */
const strongRules: ReadonlyArray<Pattern> = [
  single(
    re`\[\[(?:${IMAGE_URL}|${UNTIL_DOUBLE_CLOSE}*?${IMAGE_EXT}(?:[?#]${UNTIL_DOUBLE_CLOSE}*)?)\]\]`,
    { scopes: [SCOPES.image] },
  ),
  single(re`\[\[(${UNTIL_DOUBLE_CLOSE}+)\]\]`, {
    scopes: [SCOPES.bold],
    captures: { 1: readAs(include('inline-in-emphasis')) },
  }),
]

/** `[$ x^2]`. Its body is TeX, not notation, and may hold brackets of its own. */
const formulaRule: Pattern = region({
  scopes: [SCOPES.formula],
  begin: re`\[(?=\$)${CLOSES}`,
  end: CLOSE_ON_LINE,
  patterns: [include('bare-bracket')],
})

/**
 * Brackets whose body holds no brackets, tried in the parser's order: an icon before a
 * URL before an image path before a project link, and anything left is a page link.
 */
const simpleTargetRules = (allowImagePath: boolean): ReadonlyArray<Pattern> =>
  Arr.getSomes([
    Option.some(single(re`\[[^\[\]]+\.icon(?:\*\d+)?\]`, { scopes: [SCOPES.icon] })),
    // Only URLs, and one of them an image: the image, linking to another URL if there is one.
    Option.some(
      single(re`\[\s*(?:${URL}\s+)*(?:${IMAGE_URL})(?=[\s\]])(?:\s+${URL})*\s*\]`, {
        scopes: [SCOPES.image],
      }),
    ),
    // Any other URL makes a link, labelled or not.
    Option.some(single(re`\[[^\[\]]*${URL}[^\[\]]*\]`, { scopes: [SCOPES.externalLink] })),
    // `[a.png]`, but not inside emphasis: there Cosense links to a page of that name.
    onlyIf(allowImagePath, single(re`\[[^\[\]]*${IMAGE_EXT}\]`, { scopes: [SCOPES.image] })),
    Option.some(single(re`\[/[^\[\]]*\]`, { scopes: [SCOPES.projectLink] })),
    Option.some(single(re`\[(?=[^\[\]]*[^\s\[\]])[^\[\]]+\]`, { scopes: [SCOPES.link] })),
  ])

/** What follows the bracketed notation in both contexts, in the parser's order. */
const unbracketedRules: ReadonlyArray<Pattern> = [
  single(Regex('`[^`]*`'), { scopes: [SCOPES.code] }),
  // `#tag`, only at the start or after a space: a `#` inside a word is just a character.
  single(re`(?:^|(?<=[ \t　]))#[^\s\[\]#]+`, { scopes: [SCOPES.hashtag] }),
  // A URL outside brackets is always a link, even to an image.
  single(re`(?i:https?)://[^\s\]]+`, { scopes: [SCOPES.externalLink] }),
]

// --- Lines and blocks -------------------------------------------------------------------

/**
 * A block is its header and every line indented deeper. Deeper is approximated as
 * "the header's indentation, then more", which is exact when a page indents one way.
 */
const block = (keyword: 'code' | 'table', scope: Scope, patterns: ReadonlyArray<Pattern>) =>
  region({
    scopes: [scope],
    begin: re`^(${INDENT})(${Regex(keyword)}:)(.+)$`,
    beginCaptures: {
      2: scoped('keyword.other.block.cosense'),
      3: scoped('entity.name.section.block.cosense'),
    },
    end: re`^(?!\1[ \t　])`,
    patterns,
  })

/** Every entry the grammar can `include`. The mapped type makes a missing one an error. */
const REPOSITORY: { readonly [K in RepositoryKey]: Pattern } = {
  // The first line is the title, unless the file opens with YAML: then it is the first
  // line after the fence. Nothing on the title line is notation.
  head: group([
    region({
      begin: re`\A(?=---[ \t]*$)`,
      patterns: [include('frontmatter')],
      end: re`^(.*)$`,
      endCaptures: { 1: scoped(SCOPES.title) },
      // At the very start the fence and the title line both match: the fence wins.
      endPatternLast: true,
    }),
    single(re`\A.*$`, { scopes: [SCOPES.title] }),
  ]),
  frontmatter: region({
    scopes: [SCOPES.frontmatter],
    begin: re`\A---[ \t]*$`,
    end: re`^---[ \t]*$`,
  }),
  'code-block': block('code', SCOPES.codeBlock, []),
  'table-block': block('table', SCOPES.table, [
    single(re`\t`, { scopes: ['punctuation.separator.table-cell.cosense'] }),
  ]),
  // A component tag owns its line: nothing on it is Cosense notation.
  component: single(re`^\s*(</?)([A-Z][A-Za-z0-9_.]*)(?=\s|/?>).*$`, {
    scopes: [SCOPES.component],
    captures: {
      1: scoped('punctuation.definition.tag.begin.cosense'),
      2: scoped('support.class.component.cosense'),
    },
  }),
  quote: region({
    scopes: ['markup.quote.cosense'],
    begin: re`^${INDENT}(>[> ]*)`,
    beginCaptures: { 1: scoped(SCOPES.quote) },
    end: re`$`,
    patterns: [include('inline')],
  }),
  inline: group([
    ...strongRules,
    formulaRule,
    ...emphasisRules,
    ...simpleTargetRules(true),
    ...unbracketedRules,
  ]),
  'inline-in-emphasis': group([
    ...strongRules,
    formulaRule,
    ...simpleTargetRules(false),
    ...unbracketedRules,
  ]),
  // A bracket that is no notation, but whose `]` must not close the one around it:
  // in `[* a [] b]` the emphasis runs to the last `]`, as the parser counts depth.
  'nested-bracket': region({
    begin: re`\[`,
    end: CLOSE_ON_LINE,
    patterns: [include('inline-in-emphasis'), include('nested-bracket')],
  }),
  'bare-bracket': region({
    begin: re`\[`,
    end: CLOSE_ON_LINE,
    patterns: [include('bare-bracket')],
  }),
}

// --- Encoding ---------------------------------------------------------------------------

/** A field only when there is something to put in it: TextMate reads absent and empty alike. */
const field = <K extends keyof Rule>(key: K, value: Option.Option<Rule[K]>): Partial<Rule> =>
  Option.match(value, { onNone: () => ({}), onSome: (v) => ({ [key]: v }) })

const nonEmpty = <A>(items: ReadonlyArray<A>): Option.Option<ReadonlyArray<A>> =>
  Option.liftPredicate(items, (list) => list.length > 0)

/** TextMate gives a rule several scopes by separating them with spaces. */
const nameField = (scopes: ReadonlyArray<Scope>): Partial<Rule> =>
  field(
    'name',
    Option.map(nonEmpty(scopes), (list) => list.join(' ')),
  )

const patternsField = (patterns: ReadonlyArray<Pattern>): Partial<Rule> =>
  field('patterns', Option.map(nonEmpty(patterns), Arr.map(encode)))

const encodeCaptures = (captures: Captures): Option.Option<Record<string, Rule>> =>
  pipe(
    Object.entries(captures),
    Arr.map(
      ([group, capture]) =>
        [group, { ...nameField(capture.scopes), ...patternsField(capture.patterns) }] as const,
    ),
    nonEmpty,
    Option.map(Rec.fromEntries),
  )

const encode = (pattern: Pattern): Rule =>
  Match.value(pattern).pipe(
    Match.tag('Include', ({ key }) => ({ include: `#${key}` })),
    Match.tag('Group', ({ patterns }) => patternsField(patterns)),
    Match.tag('Single', (rule) => ({
      ...nameField(rule.scopes),
      match: rule.regex,
      ...field('captures', encodeCaptures(rule.captures)),
    })),
    Match.tag('Region', (rule) => ({
      ...nameField(rule.scopes),
      begin: rule.begin,
      end: rule.end,
      ...field('beginCaptures', encodeCaptures(rule.beginCaptures)),
      ...field('endCaptures', encodeCaptures(rule.endCaptures)),
      ...patternsField(rule.patterns),
      ...field('applyEndPatternLast', onlyIf(rule.endPatternLast, true)),
    })),
    Match.exhaustive,
  )

// --- Dialects ---------------------------------------------------------------------------

/** `.csn`, and `.csnx`, which also reads a line that is one component tag. */
export type Dialect = 'cosense' | 'cosense-x'

interface DialectInfo {
  readonly displayName: string
  readonly extension: string
  readonly components: boolean
}

const DIALECTS: { readonly [D in Dialect]: DialectInfo } = {
  cosense: { displayName: 'Cosense', extension: 'csn', components: false },
  'cosense-x': { displayName: 'Cosense X', extension: 'csnx', components: true },
}

/** What a line can be, in the order the parser decides it. */
const linePatterns = (dialect: DialectInfo): ReadonlyArray<Pattern> =>
  Arr.getSomes([
    Option.some(include('head')),
    Option.some(include('code-block')),
    Option.some(include('table-block')),
    onlyIf(dialect.components, include('component')),
    Option.some(include('quote')),
    Option.some(include('inline')),
  ])

export const buildGrammar = (dialect: Dialect): Grammar => {
  const info = DIALECTS[dialect]
  return {
    name: dialect,
    displayName: info.displayName,
    scopeName: `text.${dialect}`,
    aliases: [info.extension],
    fileTypes: [info.extension],
    patterns: Arr.map(linePatterns(info), encode),
    repository: Rec.map(REPOSITORY, encode),
  }
}
