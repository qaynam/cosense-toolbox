import { parse } from "@cosense-toolbox/parser"
import { collect } from "@cosense-toolbox/parser/utils"
import { Array as Arr, Option, Order, pipe } from "effect"

import { Asearch } from "./asearch"

/**
 * Link suggestions picked and ordered the way Cosense Web's editor does it, so a menu offers
 * what the web would. The rules and numbers below follow the web client's own link suggestion.
 *
 * Everything here is pure. Where the titles come from (files, an API) and how a client
 * turns the result into menu items is up to the caller.
 */

/** How many the web shows at once. The rest of the list goes on in the same order. */
const MENU_HEAD = 6
const MAX_SUGGESTIONS = 50

/** Literal matches at or below which the fuzzy search is worth a scan of every title. */
const FUZZY_FALLBACK_THRESHOLD = 10
/** Below this, one typo away from the query is nearly every short title. */
const FUZZY_MIN_QUERY = 3

/** The web looks for icons the page uses this far down, and moves up to this many. */
const ICON_REACH = MENU_HEAD * 3
const MAX_ICON_LEAD = 3

/** Vector results scoring below this are not offered at all. */
const VECTOR_MIN_SCORE = 0.85
/** One vector result scoring this high may take a place in the head of the menu. */
const VECTOR_LEAD_SCORE = 0.9

/**
 * A title as Cosense compares them: case and the difference between a space and `_` never
 * decide, so `[Side Kanban]` and `[side_kanban]` reach one page.
 */
export const titleKey = (title: string): string =>
  title.normalize("NFC").toLowerCase().replace(/ /g, "_")

/** The title as a tag writes it: a space becomes `_`. */
const asTagName = (title: string): string => title.replace(/ /g, "_")

/** A tag ends at whitespace, `[`, `]` or `#`; only a space has a written form that survives. */
const isTaggable = (title: string): boolean => !/[\s[\]#]/.test(asTagName(title))

/** A page as the caller knows it. Only `title` is required. */
export interface TitleEntryLike {
  readonly title: string
  /** When the page was last updated, in any unit that grows with time */
  readonly updated?: number
  /** The page's image; a page with one can be written as an icon */
  readonly image?: string | null
  /** The titles the page links to, which may have no page yet */
  readonly links?: ReadonlyArray<string>
}

/** One suggestion: an existing page, or a title linked to that has no page yet. */
export interface Candidate {
  readonly title: string
  /** `titleKey` of the title: what makes two candidates one */
  readonly key: string
  /** The key without `_`, which every word of a query has to appear in */
  readonly searchKey: string
  /** The title's length with a run of digits and a trailing suffix counted as one */
  readonly sortLength: number
  readonly exists: boolean
  /** 0 for a title with no page, which has never been updated */
  readonly updated: number
  readonly image: boolean
  /**
   * For a title with no page, the one page linking to it, while only one does. A title
   * linked only from the page being edited is that page's own unsaved idea.
   */
  readonly soleLinker?: string
}

export interface CandidateIndex {
  /** Every candidate, shortest title first and, among equals, most recently updated first */
  readonly sorted: ReadonlyArray<Candidate>
  readonly byKey: ReadonlyMap<string, Candidate>
}

/** Cosense Web's length for ordering: `日記 2024-10-03` and `日記 7` tie. */
const sortLengthOf = (title: string): number =>
  title.replace(/\d+/g, "_").replace(/[#\-_/.,\s()<>{}（）]+[a-z]?$/i, "_").length

interface CandidateFields {
  readonly exists: boolean
  readonly updated?: number | undefined
  readonly image?: boolean
}

const candidateOf = (title: string, { exists, updated = 0, image = false }: CandidateFields) => {
  const key = titleKey(title)
  return {
    title,
    key,
    searchKey: key.replaceAll("_", ""),
    sortLength: sortLengthOf(title),
    exists,
    updated,
    image,
  } satisfies Candidate
}

const pageOf = (entry: TitleEntryLike): Candidate =>
  candidateOf(entry.title, {
    exists: true,
    updated: entry.updated,
    image: typeof entry.image === "string" && entry.image !== "",
  })

/** Each title linked to, with the pages linking to it. */
const linkersOf = (
  entries: ReadonlyArray<TitleEntryLike>,
): ReadonlyMap<string, { readonly title: string; readonly from: ReadonlySet<string> }> =>
  Arr.reduce(
    Arr.flatMap(entries, (entry) =>
      Arr.map(
        Arr.filter(entry.links ?? [], (link) => link !== ""),
        (link) => ({ link, from: entry.title }),
      ),
    ),
    // Grown in place, once per link. A Map and not a record: a record would put number-like
    // titles (`7`, `2024`) first, and the order titles were first linked in breaks ties.
    new Map<string, { readonly title: string; readonly from: ReadonlySet<string> }>(),
    (found, { link, from }) => {
      const key = titleKey(link)
      const known = found.get(key)
      return found.set(key, {
        title: known?.title ?? link,
        from: new Set([...(known?.from ?? []), from]),
      })
    },
  )

const BY_LENGTH_THEN_RECENT: Order.Order<Candidate> = Order.combine(
  Order.mapInput(Order.number, (c: Candidate) => c.sortLength),
  Order.reverse(Order.mapInput(Order.number, (c: Candidate) => c.updated)),
)

/**
 * The titles to suggest from: every page, and every title a page links to. A title linked
 * to that a page also has is that page, with the page's own casing.
 */
export const buildCandidateIndex = (entries: ReadonlyArray<TitleEntryLike>): CandidateIndex => {
  const pages = Arr.dedupeWith(
    Arr.map(
      Arr.filter(entries, (entry) => entry.title !== ""),
      pageOf,
    ),
    (a: Candidate, b: Candidate) => a.key === b.key,
  )
  const pageKeys = new Set(Arr.map(pages, (page) => page.key))
  const missing = Arr.filterMap([...linkersOf(entries)], ([key, { title, from }]) =>
    pageKeys.has(key)
      ? Option.none()
      : Option.some<Candidate>({
          ...candidateOf(title, { exists: false }),
          ...(from.size === 1 ? { soleLinker: [...from][0] ?? "" } : {}),
        }),
  )
  const sorted = Arr.sort([...pages, ...missing], BY_LENGTH_THEN_RECENT)
  return { sorted, byKey: new Map(Arr.map(sorted, (c) => [c.key, c] as const)) }
}

export interface RankOptions {
  /** `#tag` completion: only titles a tag can name, and `_` separates the query's words */
  readonly tagsOnly?: boolean
  /** The page being edited, which a link to itself would be pointless from */
  readonly pageTitle?: string
  /** Keys of the icons the page being edited already uses (`iconKeys`) */
  readonly icons?: ReadonlySet<string>
}

/** Whether the web offers `c` at all, whatever the query matched. */
const isOffered = (c: Candidate, query: string, options: RankOptions): boolean =>
  !(!c.exists && c.soleLinker !== undefined && c.soleLinker === options.pageTitle) &&
  !(options.tagsOnly === true && asTagName(c.title) === query) &&
  // A page with an image stays, so that `[name` can still become `[name.icon]`.
  (c.image || (c.title !== options.pageTitle && c.title !== query))

/** The titles one typo away from `query`, among those not already found. */
const nearlyMatching = (
  pool: ReadonlyArray<Candidate>,
  query: string,
  found: ReadonlyArray<Candidate>,
): ReadonlyArray<Candidate> => {
  // Spaces around the pattern match anything: one typo anywhere in the title.
  const nearly = Asearch(` ${query} `)
  const seen = new Set(Arr.map(found, (c) => c.key))
  return Arr.filter(pool, (c) => !seen.has(c.key) && nearly(c.title, 1))
}

/** Every word in a title, in any order; when that finds little, a title a typo away too. */
const matchesOf = (
  pool: ReadonlyArray<Candidate>,
  query: string,
  tagsOnly: boolean,
): ReadonlyArray<Candidate> => {
  const words = query.toLowerCase().split(tagsOnly ? /_+/ : /\s+/)
  const literal = Arr.filter(pool, (c) => Arr.every(words, (word) => c.searchKey.includes(word)))
  return query.length >= FUZZY_MIN_QUERY && literal.length <= FUZZY_FALLBACK_THRESHOLD
    ? [...literal, ...nearlyMatching(pool, query, literal)]
    : literal
}

interface Ranked {
  readonly lead: ReadonlyArray<Candidate>
  readonly rest: ReadonlyArray<Candidate>
}

/** Pages drawn with an icon the page already uses go first, if found near enough the top. */
const leadWithIcons =
  (icons: ReadonlySet<string> | undefined) =>
  ({ lead, rest }: Ranked, c: Candidate): Ranked =>
    lead.length + rest.length >= MAX_SUGGESTIONS
      ? { lead, rest }
      : rest.length < ICON_REACH && lead.length < MAX_ICON_LEAD && c.image && icons?.has(c.key)
        ? { lead: [...lead, c], rest }
        : { lead, rest: [...rest, c] }

/**
 * The suggestions for `query`, best first, as Cosense Web orders them: titles holding every
 * word of the query, shortest first; then, when that finds little, titles a typo away. An
 * empty query is every title.
 */
export const rankCandidates = (
  index: CandidateIndex,
  query: string,
  options: RankOptions = {},
): Candidate[] => {
  const q = query.normalize("NFC").trim()
  const tagsOnly = options.tagsOnly === true
  const pool = tagsOnly ? Arr.filter(index.sorted, (c) => isTaggable(c.title)) : index.sorted
  const { lead, rest } = pipe(
    q === "" ? pool : matchesOf(pool, q, tagsOnly),
    Arr.filter((c) => isOffered(c, q, options)),
    Arr.reduce<Ranked, Candidate>({ lead: [], rest: [] }, leadWithIcons(options.icons)),
  )
  return [...lead, ...rest]
}

/** A result of a vector (semantic) search, as the caller got it. */
export interface VectorPageLike {
  readonly title: string
  readonly exists?: boolean
  readonly image?: string | null
  readonly score?: number
}

interface VectorHit {
  readonly candidate: Candidate
  readonly score: number
}

/**
 * A result as a suggestion, or None for one the web leaves out: not close enough, a title
 * that is neither a page nor linked to, or one the ranking would not offer either.
 */
const hitOf =
  (index: CandidateIndex, query: string, options: RankOptions) =>
  (page: VectorPageLike): Option.Option<VectorHit> =>
    pipe(
      Option.liftPredicate(
        page,
        ({ title, score = 0 }) => title !== "" && score >= VECTOR_MIN_SCORE,
      ),
      Option.map(({ title, exists, image, score = 0 }) => ({
        candidate:
          index.byKey.get(titleKey(title)) ??
          candidateOf(title, { exists: exists !== false, image: Boolean(image) }),
        score,
      })),
      Option.filter(
        ({ candidate: c }) =>
          (c.exists || index.byKey.has(c.key)) &&
          (options.tagsOnly !== true || isTaggable(c.title)) &&
          isOffered(c, query, options),
      ),
    )

/** At most one very close hit in the head, the rest of the head filled with close ones. */
const mergeHits = (
  ranked: ReadonlyArray<Candidate>,
  hits: ReadonlyArray<VectorHit>,
): Candidate[] => {
  const lead = Arr.filter(hits, (hit) => hit.score >= VECTOR_LEAD_SCORE).slice(0, 1)
  const others = Arr.filter(hits, (hit) => hit.score < VECTOR_LEAD_SCORE)
  const head = ranked.slice(0, Math.max(MENU_HEAD - 1, MENU_HEAD - lead.length))
  const fill = others.slice(0, Math.max(0, MENU_HEAD - head.length - lead.length))
  const merged = [...head, ...Arr.map([...lead, ...fill], (hit) => hit.candidate)]
  const taken = new Set(Arr.map(merged, (c) => c.key))
  return [...merged, ...Arr.filter(ranked, (c) => !taken.has(c.key))].slice(0, MAX_SUGGESTIONS)
}

/**
 * Vector search results folded into a ranking the way the web folds them: only close ones,
 * after the head of `ranked`, and never more than one ahead of the sixth place. The rest of
 * `ranked` follows, so nothing it found is lost.
 */
export const mergeVectorPages = (
  ranked: ReadonlyArray<Candidate>,
  pages: ReadonlyArray<VectorPageLike>,
  index: CandidateIndex,
  query: string,
  options: RankOptions = {},
): Candidate[] => {
  const q = query.normalize("NFC").trim()
  const shown = new Set(Arr.map(ranked.slice(0, MENU_HEAD), (c) => c.key))
  return Arr.match(
    pipe(
      pages,
      Arr.filterMap(hitOf(index, q, options)),
      Arr.filter((hit) => !shown.has(hit.candidate.key)),
      Arr.dedupeWith((a, b) => a.candidate.key === b.candidate.key),
    ),
    { onEmpty: () => [...ranked], onNonEmpty: (hits) => mergeHits(ranked, hits) },
  )
}

/** Keys of the icons `text` uses (`[name.icon]`), which `rankCandidates` puts first. */
export const iconKeys = (text: string): Set<string> =>
  new Set(Arr.map(collect(parse(text), "icon"), (icon) => titleKey(icon.user)))
