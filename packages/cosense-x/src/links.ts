/**
 * links.ts — `[title]` / `[./foo.csn]` / `#tag` を、手元のファイルだけで URL にする。
 *
 * Cosense にも API にも問い合わせない。オフラインで書いてもビルドできるようにするため。
 */
import type { ProjectLink } from '@cosense-toolbox/parser'
import type { PageRefNode } from '@cosense-toolbox/parser/compile'
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
  const indexed: Record<string, IndexedPage> = {}
  const titles: Record<string, string> = {}
  for (const page of pages) {
    if (page.draft === true) continue
    indexed[page.id] = { id: page.id, title: page.title, slug: page.slug }
    titles[normalizeTitle(page.title)] ??= page.id
  }
  return { pages: indexed, titles }
}

/** 索引からタイトルでページを引く。 */
export const findByTitle = (index: PageIndex, title: string): IndexedPage | undefined => {
  const id = index.titles[normalizeTitle(title)]
  return id === undefined ? undefined : index.pages[id]
}

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

/**
 * `toHast` の `resolveLink` に渡す関数を作る。
 * `warnings` を渡すと、`unresolved: 'warn'` のときにここへ積む。
 */
export const createLinkResolver = (
  options: LinkOptions,
  warnings: string[] = [],
): ((node: PageRefNode) => ResolvedLink | null) => {
  const pageUrl = options.pageUrl ?? defaultPageUrl
  const projectUrl = options.projectUrl ?? defaultProjectUrl
  const policy = options.unresolved ?? 'text'
  const { index } = options

  const unresolved = (target: string, canLink: boolean): ResolvedLink | null => {
    const where = options.filePath === undefined ? '' : ` (${options.filePath})`
    const message = `リンク先のページが見つからない: [${target}]${where}`
    switch (policy) {
      case 'link':
        return canLink
          ? { href: pageUrl({ id: null, title: target, slug: titleToSlug(target) }) }
          : null
      case 'warn':
        warnings.push(message)
        return null
      case 'error':
        throw new Error(message)
      default:
        return null
    }
  }

  const byTitle = (title: string): ResolvedLink | null => {
    if (index === undefined) return { href: pageUrl({ id: null, title, slug: titleToSlug(title) }) }
    const page = findByTitle(index, title)
    return page === undefined ? unresolved(title, true) : { href: pageUrl(page) }
  }

  const byPath = (relative: string): ResolvedLink | null => {
    if (index === undefined || options.filePath === undefined) return unresolved(relative, false)
    const page = index.pages[resolveRelativePath(options.filePath, relative)]
    // 相対パスはファイル名なので、表示はリンク先のタイトルにする。
    return page === undefined
      ? unresolved(relative, false)
      : { href: pageUrl(page), label: page.title }
  }

  const fromUrl = (href: string | null): ResolvedLink | null => (href === null ? null : { href })

  return (node) => {
    switch (node.type) {
      case 'internalLink':
        return isRelativePath(node.target) ? byPath(node.target) : byTitle(node.target)
      case 'hashtag':
        return options.tagUrl === undefined
          ? byTitle(node.value)
          : fromUrl(options.tagUrl(node.value))
      case 'projectLink':
        return fromUrl(projectUrl(node))
      case 'icon': {
        // ブログにはユーザーのページが無いことが多いので、無くても警告しない。
        const page = index === undefined ? undefined : findByTitle(index, node.user)
        return page === undefined ? null : { href: pageUrl(page) }
      }
      default:
        return null
    }
  }
}
