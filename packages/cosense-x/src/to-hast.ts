/**
 * to-hast.ts — Cosense の AST を hast (HTML の AST) にする。
 *
 * 出力する要素と class 名は `@cosense-toolbox/parser/compile` の `toHtml` と揃える。
 * `@cosense-toolbox/style` がそのまま当たるようにするため。
 * hast にしておけば、rehype のプラグインを通してから JS にできる。
 */
import {
  type AnyNode,
  type CodeBlock,
  type Decoration,
  type IconNode,
  type InlineNode,
  type LineBlock,
  type Page,
  type TableBlock,
  type TopLevelBlock,
  asImageSrc,
} from '@cosense-toolbox/parser'
import {
  type HtmlClassNames,
  type PageRefNode,
  defaultClassNames,
  defaultPageUrl,
  safeHref,
  safeSrc,
} from '@cosense-toolbox/parser/compile'
import { childrenOf } from '@cosense-toolbox/parser/utils'
import type { Element, ElementContent, Parent, Properties, Root, RootContent, Text } from 'hast'
import {
  type ComponentAttribute,
  type ComponentBlock,
  type GroupedBlock,
  groupComponents,
} from './components'

/**
 * コンポーネントの呼び出し。hast には無いノード型なので、JS にするときに専用の変換を通す。
 * `fallback` / `fallbackEnd` はコンポーネントが渡されなかったときに children の前後に出す、
 * 元の開始タグと閉じタグの行。
 */
export interface CosenseComponent extends Parent {
  readonly type: 'cosenseComponent'
  readonly name: string
  readonly attributes: readonly ComponentAttribute[]
  readonly fallback: Element
  /** 閉じタグの行。自己完結のタグなら null */
  readonly fallbackEnd: Element | null
  children: ElementContent[]
}

declare module 'hast' {
  interface RootContentMap {
    cosenseComponent: CosenseComponent
  }
  interface ElementContentMap {
    cosenseComponent: CosenseComponent
  }
}

/** リンクの解決結果。`label` を返すと表示テキストを差し替える (相対パスのリンクで使う)。 */
export interface ResolvedLink {
  readonly href: string
  readonly label?: string
}

export interface ToHastOptions {
  /**
   * ページを指す記法 (`[title]` / `[/proj/page]` / `#tag` / `[user.icon]`) の遷移先。
   * null を返すとリンクにせず、テキストとして出す。
   *
   * @defaultValue `toHtml` と同じく `/{title}`
   */
  readonly resolveLink?: (node: PageRefNode) => ResolvedLink | null
  /** アイコンの画像 URL。null なら `<img>` を出さず、ユーザー名のテキストになる。 */
  readonly iconImageUrl?: (node: IconNode) => string | null
  /** 出力する要素に付ける class 名。指定したキーだけが既定を上書きする。 */
  readonly classNames?: HtmlClassNames
  /** インデントを Cosense Web と同じ要素として書き出す。 */
  readonly showPads?: boolean
  /**
   * タイトル行を `<h1>` として出すか。レイアウト側でタイトルを出すなら false にする。
   *
   * @defaultValue true
   */
  readonly title?: boolean
  /**
   * `<Name />` の行をコンポーネントにする (`.csnx`)。
   * 行の生テキストを読むので、パースに渡した文字列を `source` に渡す。
   */
  readonly components?: {
    readonly source: string
    /** エラーに出す行番号に足す数。ファイル先頭の YAML を取り除いて渡したときに使う */
    readonly lineOffset?: number
  }
}

const text = (value: string): Text => ({ type: 'text', value })

const classList = (name: string | undefined): string[] =>
  name === undefined ? [] : name.split(/\s+/).filter((part) => part !== '')

const element = (
  tagName: string,
  properties: Properties,
  children: ElementContent[] = [],
): Element => ({ type: 'element', tagName, properties, children })

/** 空の class は属性ごと出さない。`toHtml` で class 名を空文字にしたときと同じ振る舞い。 */
const withClass = (className: string | undefined, properties: Properties = {}): Properties => {
  const names = classList(className)
  return names.length === 0 ? properties : { className: names, ...properties }
}

/** 0 は既定値なので属性にしない。 */
const positive = (value: number): Properties[string] => (value > 0 ? value : undefined)

const compact = (properties: Properties): Properties =>
  Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined))

const DECORATION_TAGS: readonly (readonly [(node: Decoration) => boolean, string])[] = [
  [(node) => node.strike, 's'],
  [(node) => node.underline, 'u'],
  [(node) => node.italic, 'em'],
  [(node) => node.bold, 'strong'],
]

const pageTitleOf = (node: PageRefNode): string => {
  switch (node.type) {
    case 'hashtag':
      return node.value
    case 'icon':
      return node.user
    default:
      return node.target
  }
}

/** `resolveLink` の既定。`toHtml` の `pageUrl` の既定と同じ URL にする。 */
export const defaultResolveLink = (node: PageRefNode): ResolvedLink => ({
  href: defaultPageUrl(pageTitleOf(node)),
})

/** Cosense の AST (ページ全体) を hast にする。 */
export const toHast = (page: Page, options: ToHastOptions = {}): Root => {
  const cls: HtmlClassNames = { ...defaultClassNames, ...options.classNames }
  const resolveLink = options.resolveLink ?? defaultResolveLink
  const iconImageUrl = options.iconImageUrl ?? (() => null)

  const resolve = (node: PageRefNode): ResolvedLink | null => {
    const resolved = resolveLink(node)
    if (resolved === null) return null
    const href = safeHref(resolved.href)
    return href === null || href === '' ? null : { ...resolved, href }
  }

  /** 解決できたらリンク、できなければテキスト。 */
  const pageRef = (node: PageRefNode, className: string | undefined, label: string) => {
    const resolved = resolve(node)
    if (resolved === null) return text(label)
    return element('a', withClass(className, { href: resolved.href }), [
      text(resolved.label ?? label),
    ])
  }

  const inline = (node: InlineNode): ElementContent[] => {
    switch (node.type) {
      case 'text':
        return [text(node.value)]
      case 'internalLink':
        return [pageRef(node, cls.internalLink, node.label)]
      case 'projectLink':
        return [pageRef(node, cls.projectLink, node.label)]
      case 'hashtag':
        return [pageRef(node, cls.hashtag, `#${node.value}`)]
      case 'externalLink': {
        const href = safeHref(node.target)
        return [
          element('a', withClass(cls.externalLink, compact({ href: href || undefined })), [
            text(node.label),
          ]),
        ]
      }
      case 'inlineCode':
        return [element('code', withClass(cls.inlineCode), [text(node.value)])]
      case 'image': {
        // Gyazo のページ URL のように、書かれたままでは <img> に入らない URL をここで直す。
        const src = safeSrc(asImageSrc(node.src) ?? node.src)
        const img = element(
          'img',
          withClass(
            cls.image,
            compact({ src: src || undefined, alt: '', dataLarge: node.large ? 'true' : undefined }),
          ),
        )
        const href = node.link === undefined ? null : safeHref(node.link)
        return [href ? element('a', { href }, [img]) : img]
      }
      case 'icon':
        return icon(node)
      case 'formula':
        return [element('span', withClass(cls.formula), [text(node.value)])]
      case 'decoration':
        return [decoration(node)]
      default:
        return fallback(node)
    }
  }

  // Cosense Web と同じく、そのユーザーのページへのリンクで画像を包む。
  const icon = (node: IconNode): ElementContent[] => {
    const src = iconImageUrl(node)
    const safe = src === null ? null : safeSrc(src)
    const body: ElementContent = safe
      ? element('img', withClass(cls.icon, { src: safe, alt: node.user, title: node.user }))
      : text(node.user)
    const resolved = resolve(node)
    const className = [cls.internalLink, cls.icon].filter(Boolean).join(' ')
    const one = (): ElementContent =>
      resolved === null
        ? structuredClone(body)
        : element('a', withClass(className, { href: resolved.href }), [structuredClone(body)])
    return Array.from({ length: node.count }, one)
  }

  const decoration = (node: Decoration): Element => {
    const inner = DECORATION_TAGS.filter(([isOn]) => isOn(node)).reduce<ElementContent[]>(
      (children, [, tag]) => [element(tag, {}, children)],
      node.children.flatMap(inline),
    )
    // Cosense Web と同じく記号ごとの class も出す。意味を持たない記号を CSS で拾えるようにするため。
    const names = [...classList(cls.decoration), ...node.markers.map((marker) => `deco-${marker}`)]
    const properties = compact({
      className: names.length === 0 ? undefined : names,
      dataSizeLevel: positive(node.sizeLevel),
    })
    return element('span', properties, inner)
  }

  /** 拡張が足した独自ノードでも、中身は落とさない。 */
  const fallback = (node: AnyNode): ElementContent[] =>
    childrenOf(node).flatMap((child) => inline(child as InlineNode))

  const indentMark = (indent: number): Element =>
    element('span', withClass(cls.indentMark), [
      ...Array.from({ length: indent }, () => element('span', withClass(cls.pad), [text(' ')])),
      element('span', withClass(cls.dot)),
    ])

  const line = (node: LineBlock): Element => {
    const body = node.children.flatMap(inline)
    const styled = node.monospace ? [element('code', withClass(cls.monospace), body)] : body
    const quoted = node.quote ? [element('blockquote', withClass(cls.quote), styled)] : styled
    // 空行も 1 行分の高さを保つ。Cosense では空行が段落の区切りとして意味を持つ。
    const inner = quoted.length === 0 ? [element('br', {})] : quoted
    const mark = options.showPads === true && node.indent > 0 ? [indentMark(node.indent)] : []
    return element('div', withClass(cls.line, compact({ dataIndent: positive(node.indent) })), [
      ...mark,
      ...inner,
    ])
  }

  const codeBlock = (node: CodeBlock): Element[] => {
    const classes = [cls.line, cls.codeBlock].filter(Boolean).join(' ')
    const blockLine = (indent: number, child: Element): Element =>
      element('div', withClass(classes, compact({ dataIndent: positive(indent) })), [child])
    const filename = element('span', withClass(cls.codeFilename), [text(node.filename)])
    const header = blockLine(node.indent, element('code', withClass(cls.codeStart), [filename]))
    return [
      header,
      // 本体はヘッダより 1 段深い。それより深い字下げは値のほうに残っている。
      ...node.lines.map((codeLine) =>
        blockLine(
          node.indent + 1,
          element('code', withClass(cls.codeBody), [text(codeLine.value)]),
        ),
      ),
    ]
  }

  const table = (node: TableBlock): Element => {
    const caption = node.name === '' ? [] : [element('caption', {}, [text(node.name)])]
    const rows = node.rows.map((row) =>
      element(
        'tr',
        {},
        // Cosense のテーブルにヘッダ行の概念は無いので、1 行目も含めてすべて td。
        row.cells.map((cell) => element('td', {}, [text(cell.value)])),
      ),
    )
    return element('table', withClass(cls.table), [...caption, element('tbody', {}, rows)])
  }

  const component = (node: ComponentBlock): CosenseComponent => ({
    type: 'cosenseComponent',
    name: node.name,
    attributes: node.attributes,
    fallback: line(node.line),
    fallbackEnd: node.closeLine === null ? null : line(node.closeLine),
    children: node.children.flatMap(block),
  })

  const block = (node: GroupedBlock): ElementContent[] => {
    switch (node.type) {
      case 'title':
        return options.title === false
          ? []
          : [element('h1', withClass(cls.title), node.children.flatMap(inline))]
      case 'line':
        return [line(node)]
      case 'codeBlock':
        return codeBlock(node)
      case 'table':
        return [table(node)]
      case 'component':
        return [component(node)]
      default:
        return []
    }
  }

  const blocks: readonly GroupedBlock[] =
    options.components === undefined
      ? page.children
      : groupComponents(
          page.children as readonly TopLevelBlock[],
          options.components.source,
          options.components.lineOffset,
        )

  const children: RootContent[] = [element('div', withClass(cls.page), blocks.flatMap(block))]
  return { type: 'root', children }
}
