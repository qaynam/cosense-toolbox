/**
 * links.ts — `[title]` / `[./foo.csn]` / `#tag` を、手元のファイルだけで URL にする。
 *
 * Cosense にも API にも問い合わせない。オフラインで書いてもビルドできるようにするため。
 */
import type { ProjectLink } from '@cosense-toolbox/parser'
import type { PageRefNode } from '@cosense-toolbox/parser/html'
import { Match, Option, pipe } from 'effect'

import { type CosenseXError, toError, unresolvedLinkError } from './errors'
import { isRelativePath, normalizeTitle, resolveRelativePath, titleToSlug } from './title'
import type { ResolvedLink } from './to-hast'

/** 索引に載るページ。`id` はファイルのパスで、`[./foo.csn]` の解決に使う。 */
export interface IndexedPage {
  readonly id: string
  readonly title: string
  readonly slug: string
}

/**
 * タイトルとファイルパスからページを引く索引。JSON にして持ち回れるよう、ただのオブジェクトにしてある。
 */
export interface PageIndex {
  readonly pages: Readonly<Record<string, IndexedPage>>
  /** `normalizeTitle` したタイトル → id */
  readonly titles: Readonly<Record<string, string>>
}

export interface IndexInput extends IndexedPage {
  readonly draft?: boolean
}

/**
 * 索引を作る。draft のページは載せない。そのページへのリンクは「解決できないリンク」になる。
 * 同じタイトルのページが複数あれば、先に渡したほうを使う。
 */
export const createIndex = (pages: readonly IndexInput[]): PageIndex => {
  const published = pages.filter((page) => page.draft !== true)
  return {
    pages: Object.fromEntries(
      published.map(({ id, title, slug }) => [id, { id, title, slug }] as const),
    ),
    // Object.fromEntries は後のものが勝つので、逆順に並べて先に渡したほうを残す。
    titles: Object.fromEntries(
      published.map(({ id, title }) => [normalizeTitle(title), id] as const).reverse(),
    ),
  }
}

/** `findByTitle` の、Option を返す版。 */
export const pageByTitle = (index: PageIndex, title: string): Option.Option<IndexedPage> =>
  pipe(
    Option.fromNullable(index.titles[normalizeTitle(title)]),
    Option.flatMap((id) => Option.fromNullable(index.pages[id])),
  )

/** 索引からタイトルでページを引く。 */
export const findByTitle = (index: PageIndex, title: string): IndexedPage | undefined =>
  Option.getOrUndefined(pageByTitle(index, title))

/** 索引から、`from` のファイルから見た相対パスでページを引く。 */
export const pageByPath = (
  index: PageIndex,
  from: string,
  relative: string,
): Option.Option<IndexedPage> =>
  Option.fromNullable(index.pages[resolveRelativePath(from, relative)])

/**
 * 解決できないリンクの扱い。
 *
 * - `text`：リンクにせずテキストとして出す。非公開ページの名前が URL に漏れない
 * - `link`：索引に無くても、タイトルから作った URL へのリンクにする
 * - `warn`：テキストとして出し、`warnings` に積む。書いている最中にリンク切れを拾うため
 * - `error`：コンパイルを失敗させる
 */
export type UnresolvedLinkPolicy = 'text' | 'link' | 'warn' | 'error'

/** URL を決める関数に渡るページ。索引に無いページ (`unresolved: 'link'`) では `id` が null。 */
export interface LinkTarget {
  readonly id: string | null
  readonly title: string
  readonly slug: string
}

export interface LinkOptions {
  /**
   * 手元のページの索引。渡さなければ、`[title]` はすべて存在するページとみなしてリンクにする。
   */
  readonly index?: PageIndex
  /** 今のファイルの id (索引と同じ基点のパス)。`[./foo.csn]` の解決に使う */
  readonly filePath?: string
  /**
   * ページの URL。
   *
   * @defaultValue `/{slug}`
   */
  readonly pageUrl?: (page: LinkTarget) => string
  /**
   * `#tag` の URL。null ならテキストにする。
   *
   * @defaultValue 渡さなければ `[tag]` と同じくページへのリンクとして扱う (Cosense と同じ)
   */
  readonly tagUrl?: (tag: string) => string | null
  /**
   * `[/project/page]` の URL。null ならテキストにする。
   *
   * @defaultValue `https://scrapbox.io/{project}/{page}`
   */
  readonly projectUrl?: (node: ProjectLink) => string | null
  /**
   * 索引に無いページへのリンクの扱い。索引を渡したときだけ効く。
   *
   * @defaultValue `'text'`
   */
  readonly unresolved?: UnresolvedLinkPolicy
}

export const defaultPageUrl = (page: LinkTarget): string => `/${encodeURIComponent(page.slug)}`

/** Cosense の URL の形。タイトルの空白は `_` になる。 */
export const defaultProjectUrl = (node: ProjectLink): string => {
  const project = encodeURIComponent(node.project)
  return node.title === ''
    ? `https://scrapbox.io/${project}`
    : `https://scrapbox.io/${project}/${encodeURIComponent(node.title.replace(/ /g, '_'))}`
}

/** 1 つのリンクを解決した結果。 */
export type LinkResolution =
  | { readonly _tag: 'resolved'; readonly link: ResolvedLink }
  /** リンクにせずテキストとして出す */
  | { readonly _tag: 'text' }
  /** テキストとして出し、警告する */
  | { readonly _tag: 'warning'; readonly message: string }
  /** コンパイルを失敗させる */
  | { readonly _tag: 'failure'; readonly error: CosenseXError }

const resolved = (link: ResolvedLink): LinkResolution => ({ _tag: 'resolved', link })
const asText: LinkResolution = { _tag: 'text' }

/** リンクの解決の仕方。`toHast` に渡す関数は、これを `reportLinks` で包んで作る。 */
export const linkResolution = (options: LinkOptions): ((node: PageRefNode) => LinkResolution) => {
  const pageUrl = options.pageUrl ?? defaultPageUrl
  const projectUrl = options.projectUrl ?? defaultProjectUrl
  const { index, filePath } = options

  const toTitle = (title: string): LinkResolution =>
    resolved({ href: pageUrl({ id: null, title, slug: titleToSlug(title) }) })

  /** 索引に無いリンク。相対パスは `link` にしてもページの URL を作れないので、テキストにする。 */
  const unresolved = (target: string, canLink: boolean): LinkResolution => {
    const where = filePath === undefined ? '' : ` (${filePath})`
    const message = `リンク先のページが見つからない: [${target}]${where}`
    return Match.value(options.unresolved ?? 'text').pipe(
      Match.when('link', () => (canLink ? toTitle(target) : asText)),
      Match.when('warn', (): LinkResolution => ({ _tag: 'warning', message })),
      Match.when('error', (): LinkResolution => ({
        _tag: 'failure',
        error: unresolvedLinkError(message),
      })),
      Match.when('text', () => asText),
      Match.exhaustive,
    )
  }

  const byTitle = (title: string): LinkResolution =>
    index === undefined
      ? toTitle(title)
      : Option.match(pageByTitle(index, title), {
          onNone: () => unresolved(title, true),
          onSome: (page) => resolved({ href: pageUrl(page) }),
        })

  const byPath = (relative: string): LinkResolution =>
    index === undefined || filePath === undefined
      ? unresolved(relative, false)
      : Option.match(pageByPath(index, filePath, relative), {
          onNone: () => unresolved(relative, false),
          // 相対パスはファイル名なので、表示はリンク先のタイトルにする。
          onSome: (page) => resolved({ href: pageUrl(page), label: page.title }),
        })

  const fromUrl = (href: string | null): LinkResolution =>
    href === null ? asText : resolved({ href })

  return (node) =>
    Match.value(node).pipe(
      Match.when({ type: 'internalLink' }, (link) =>
        isRelativePath(link.target) ? byPath(link.target) : byTitle(link.target),
      ),
      Match.when({ type: 'hashtag' }, (tag) =>
        options.tagUrl === undefined ? byTitle(tag.value) : fromUrl(options.tagUrl(tag.value)),
      ),
      Match.when({ type: 'projectLink' }, (link) => fromUrl(projectUrl(link))),
      // ブログにはユーザーのページが無いことが多いので、無くても警告しない。
      Match.when({ type: 'icon' }, (icon) =>
        index === undefined
          ? asText
          : Option.match(pageByTitle(index, icon.user), {
              onNone: () => asText,
              onSome: (page) => resolved({ href: pageUrl(page) }),
            }),
      ),
      Match.exhaustive,
    )
}

/**
 * 解決の結果を `toHast` の `resolveLink` の形にする。警告と失敗は、渡した関数に知らせる。
 * `toHast` はリンクを 1 つずつ問い合わせるので、知らせる先は呼び出し側が用意する。
 */
export const reportLinks =
  (
    resolve: (node: PageRefNode) => LinkResolution,
    report: {
      readonly warning: (message: string) => void
      readonly failure: (error: CosenseXError) => void
    },
  ) =>
  (node: PageRefNode): ResolvedLink | null =>
    Match.value(resolve(node)).pipe(
      Match.tag('resolved', ({ link }) => link),
      Match.tag('text', () => null),
      Match.tag('warning', ({ message }) => {
        report.warning(message)
        return null
      }),
      Match.tag('failure', ({ error }) => {
        report.failure(error)
        return null
      }),
      Match.exhaustive,
    )

/**
 * `toHast` の `resolveLink` に渡す関数を作る。
 * `warnings` を渡すと、`unresolved: 'warn'` のときにここへ積む。
 * `unresolved: 'error'` のときは、解決できないリンクで例外を投げる。
 */
export const createLinkResolver = (
  options: LinkOptions,
  warnings: string[] = [],
): ((node: PageRefNode) => ResolvedLink | null) =>
  reportLinks(linkResolution(options), {
    warning: (message) => warnings.push(message),
    failure: (error) => {
      throw toError(error)
    },
  })
