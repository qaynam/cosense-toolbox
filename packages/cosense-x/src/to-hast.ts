/**
 * to-hast.ts — Cosense の AST を hast (HTML の AST) にする。
 *
 * 出力する要素と class 名は `@cosense-toolbox/parser/compile` の `toHtml` と揃える。
 * `@cosense-toolbox/style` がそのまま当たるようにするため。
 * hast にしておけば、rehype のプラグインを通してから JS にできる。
 */
import {
  type CodeBlock,
  type Decoration,
  type IconNode,
  type LineBlock,
  type Page,
  type ParseOptions,
  type TableBlock,
  type TopLevelBlock,
  asImageSrc,
} from '@cosense-toolbox/parser'
import {
  type HtmlClassNames,
  type PageRefNode,
  codeLanguageOf,
  createCompiler,
  defaultClassNames,
  defaultPageUrl,
  safeHref,
  safeSrc,
} from '@cosense-toolbox/parser/compile'
import { Either, Match, Option, pipe } from 'effect'
import type { Element, ElementContent, Parent, Properties, Root, Text } from 'hast'
import {
  type ComponentAttribute,
  type ComponentBlock,
  type GroupedBlock,
  groupComponentsEither,
} from './components'
import { type CosenseXError, orThrow } from './errors'
import { type InlineComponent, type InlinePart, inlineComponentsOf } from './inline-components'

/**
 * コンポーネントの呼び出し。hast には無いノード型なので、JS にするときに専用の変換を通す。
 * `fallback` / `fallbackEnd` はコンポーネントが渡されなかったときに children の前後に出す、
 * 元の開始タグと閉じタグ。行ごと書いたものは行の要素、行の途中に書いたものはテキスト。
 */
export interface CosenseComponent extends Parent {
  readonly type: 'cosenseComponent'
  readonly name: string
  readonly attributes: readonly ComponentAttribute[]
  readonly fallback: ElementContent
  /** 閉じタグ。自己完結のタグなら null */
  readonly fallbackEnd: ElementContent | null
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

/**
 * コードブロックの中身を色付けする。`toHtml` の `highlight` の hast 版。
 *
 * `language` はファイル名から推測した名前 (`code:hello.js` なら `js`、`code:python` なら `python`)。
 * null を返すと色付けせず、1 行ずつのまま出す。知らない言語のときに使う。
 *
 * shiki の `codeToHast` のように `pre > code` を返したときは、code の中身を使い、
 * pre の class と style (テーマの背景色や文字色) をコードブロックの code に移す。
 * 行の要素 (`div.line`) の中に置くので、pre そのものは出さない。
 */
export type HastHighlighter = (code: string, language: string) => Root | ElementContent[] | null

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
   * コードブロックの中身の色付け。渡すと、本体は 1 行 1 要素ではなく 1 つの要素にまとまる。
   * ハイライタの出力が複数行にまたがる要素を含みうるため (`toHtml` と同じ)。
   */
  readonly highlight?: HastHighlighter
  /**
   * タイトル行を `<h1>` として出すか。レイアウト側でタイトルを出すなら false にする。
   *
   * @defaultValue true
   */
  readonly title?: boolean
  /**
   * `<Name />` のタグをコンポーネントにする (`.csnx`)。行ごと書いたものも、行の途中に書いたものも読む。
   * 行の生テキストを読むので、パースに渡した文字列を `source` に渡す。
   */
  readonly components?: {
    readonly source: string
    /** エラーや警告に出す行番号に足す数。ファイル先頭の YAML を取り除いて渡したときに使う */
    readonly lineOffset?: number
    /** パーサーに渡したオプション。行の途中のタグの間の文字列を読み直すのに使う */
    readonly parseOptions?: ParseOptions
    /** 行の途中の閉じていないタグなどを、テキストに戻したときに呼ぶ */
    readonly onWarning?: (message: string) => void
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

/** 色付けした本体と、コードブロックの code に足す class と style。 */
interface HighlightedBody {
  readonly children: ElementContent[]
  readonly className: readonly string[]
  readonly style: string | undefined
}

const isElement = (node: unknown, tagName: string): node is Element =>
  typeof node === 'object' &&
  node !== null &&
  (node as Element).type === 'element' &&
  (node as Element).tagName === tagName

/** 空白だけのテキストを除いた、ただ 1 つの子。 */
const onlyChild = (children: readonly unknown[]): unknown => {
  const meaningful = children.filter(
    (child) => !((child as Text).type === 'text' && (child as Text).value.trim() === ''),
  )
  return meaningful.length === 1 ? meaningful[0] : undefined
}

/**
 * ハイライタの出力をコードブロックの code の中身にする。
 * `pre > code` (shiki や lowlight を rehype で通した形) なら pre を剥がし、
 * pre に付いたテーマの class と style を引き継ぐ。
 */
const highlightedBody = (result: Root | ElementContent[]): HighlightedBody => {
  const children = Array.isArray(result) ? result : result.children
  const pre = onlyChild(children)
  if (isElement(pre, 'pre')) {
    const code = onlyChild(pre.children)
    if (isElement(code, 'code')) {
      // hast の決まりでは className の配列だが、shiki は class を文字列で付ける。
      const className = pre.properties.className ?? pre.properties.class
      const style = pre.properties.style
      return {
        children: code.children,
        className: Array.isArray(className)
          ? className.map(String)
          : classList(typeof className === 'string' ? className : undefined),
        style: typeof style === 'string' ? style : undefined,
      }
    }
  }
  return { children: children as ElementContent[], className: [], style: undefined }
}

const DECORATION_TAGS: readonly (readonly [(node: Decoration) => boolean, string])[] = [
  [(node) => node.strike, 's'],
  [(node) => node.underline, 'u'],
  [(node) => node.italic, 'em'],
  [(node) => node.bold, 'strong'],
]

/** 記法に書かれたページタイトル。parser の `toHtml` と同じ。 */
const pageTitleOf = (node: PageRefNode): string =>
  Match.value(node).pipe(
    Match.when({ type: 'hashtag' }, (tag) => tag.value),
    Match.when({ type: 'icon' }, (icon) => icon.user),
    Match.orElse((link) => link.target),
  )

/** `resolveLink` の既定。`toHtml` の `pageUrl` の既定と同じ URL にする。 */
export const defaultResolveLink = (node: PageRefNode): ResolvedLink => ({
  href: defaultPageUrl(pageTitleOf(node)),
})

/** `toHast` の、失敗を Either で返す版。 */
export const toHastEither = (
  page: Page,
  options: ToHastOptions = {},
): Either.Either<Root, CosenseXError> => {
  const cls: HtmlClassNames = { ...defaultClassNames, ...options.classNames }
  const resolveLink = options.resolveLink ?? defaultResolveLink
  const iconImageUrl = options.iconImageUrl ?? (() => null)

  /** 解決できて、安全な URL になったリンク。 */
  const resolve = (node: PageRefNode): Option.Option<ResolvedLink> =>
    pipe(
      Option.fromNullable(resolveLink(node)),
      Option.flatMap((resolved) =>
        pipe(
          Option.fromNullable(safeHref(resolved.href)),
          Option.filter((href) => href !== ''),
          Option.map((href) => ({ ...resolved, href })),
        ),
      ),
    )

  /** 解決できたらリンク、できなければテキスト。 */
  const pageRef = (
    node: PageRefNode,
    className: string | undefined,
    label: string,
  ): ElementContent[] => [
    Option.match(resolve(node), {
      onNone: () => text(label),
      onSome: (resolved) =>
        element('a', withClass(className, { href: resolved.href }), [
          text(resolved.label ?? label),
        ]),
    }),
  ]

  // Cosense Web と同じく、そのユーザーのページへのリンクで画像を包む。
  const icon = (node: IconNode): ElementContent[] => {
    const body: ElementContent = pipe(
      Option.fromNullable(iconImageUrl(node)),
      Option.flatMap((src) => Option.fromNullable(safeSrc(src))),
      Option.filter((src) => src !== ''),
      Option.match({
        onNone: () => text(node.user),
        onSome: (src) =>
          element('img', withClass(cls.icon, { src, alt: node.user, title: node.user })),
      }),
    )
    const className = [cls.internalLink, cls.icon].filter(Boolean).join(' ')
    const one = Option.match(resolve(node), {
      onNone: () => (): ElementContent => structuredClone(body),
      onSome: (resolved) => (): ElementContent =>
        element('a', withClass(className, { href: resolved.href }), [structuredClone(body)]),
    })
    return Array.from({ length: node.count }, one)
  }

  const decoration = (node: Decoration, children: ElementContent[]): Element => {
    const inner = DECORATION_TAGS.filter(([isOn]) => isOn(node)).reduce<ElementContent[]>(
      (wrapped, [, tag]) => [element(tag, {}, wrapped)],
      children,
    )
    // Cosense Web と同じく記号ごとの class も出す。意味を持たない記号を CSS で拾えるようにするため。
    const names = [...classList(cls.decoration), ...node.markers.map((marker) => `deco-${marker}`)]
    const properties = compact({
      className: names.length === 0 ? undefined : names,
      dataSizeLevel: positive(node.sizeLevel),
    })
    return element('span', properties, inner)
  }

  const indentMark = (indent: number): Element =>
    element('span', withClass(cls.indentMark), [
      ...Array.from({ length: indent }, () => element('span', withClass(cls.pad), [text(' ')])),
      element('span', withClass(cls.dot)),
    ])

  /** 行の途中のコンポーネント。渡されなかったときはタグをテキストのまま出す */
  const inlineComponent = (node: InlineComponent): CosenseComponent => ({
    type: 'cosenseComponent',
    name: node.name,
    attributes: node.attributes,
    fallback: text(node.open),
    fallbackEnd: node.close === null ? null : text(node.close),
    children: node.children.flatMap(inlinePart),
  })

  const inlinePart = (node: InlinePart): ElementContent[] =>
    node.type === 'inlineComponent' ? [inlineComponent(node)] : compileNode(node)

  /**
   * 1 行。`.csnx` なら行の途中のコンポーネントを読む。
   * タグだけの行 (行ごとのコンポーネントの開始タグと閉じタグ) は `tags: false` で呼び、
   * 行の途中のタグとして読み直さない。
   */
  const line = (node: LineBlock, tags: boolean): Element => {
    const components = options.components
    const found =
      tags && components !== undefined
        ? inlineComponentsOf(node, components.source, components)
        : Option.none()
    const body = Option.match(found, {
      onNone: () => node.children.flatMap(compileNode),
      onSome: ({ parts, warnings }) => {
        for (const warning of warnings) components?.onWarning?.(warning)
        return parts.flatMap(inlinePart)
      },
    })
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
    const highlighted = pipe(
      Option.fromNullable(options.highlight),
      Option.flatMapNullable((highlight) =>
        highlight(
          node.lines.map((codeLine) => codeLine.value).join('\n'),
          codeLanguageOf(node.filename),
        ),
      ),
      Option.map(highlightedBody),
    )
    if (Option.isSome(highlighted)) {
      const { children, className, style } = highlighted.value
      const names = [cls.codeBody, cls.codeHighlight, ...className].filter(Boolean).join(' ')
      // 本体はヘッダより 1 段深い。ひと塊なので、それより深い字下げは中身のほうに残る。
      return [
        header,
        blockLine(node.indent + 1, element('code', withClass(names, compact({ style })), children)),
      ]
    }
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

  /**
   * ノード型ごとの変換。parser の `toHtml` と同じ仕組みで、ハンドラの無いノード型
   * (拡張が足した独自ノードなど) は、中身を落とさずに子だけを出す。
   */
  const compileNode = createCompiler<ElementContent[]>({
    fallback: (node, ctx) => ctx.children(node).flat(),
    handlers: {
      title: (node, ctx) =>
        options.title === false
          ? []
          : [element('h1', withClass(cls.title), ctx.children(node).flat())],
      line: (node) => [line(node, true)],
      codeBlock,
      table: (node) => [table(node)],

      text: (node) => [text(node.value)],
      internalLink: (node) => pageRef(node, cls.internalLink, node.label),
      projectLink: (node) => pageRef(node, cls.projectLink, node.label),
      hashtag: (node) => pageRef(node, cls.hashtag, `#${node.value}`),
      externalLink: (node) => [
        element(
          'a',
          withClass(cls.externalLink, compact({ href: safeHref(node.target) || undefined })),
          [text(node.label)],
        ),
      ],
      inlineCode: (node) => [element('code', withClass(cls.inlineCode), [text(node.value)])],
      image: (node) => {
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
      },
      icon,
      formula: (node) => [element('span', withClass(cls.formula), [text(node.value)])],
      decoration: (node, ctx) => [decoration(node, ctx.children(node).flat())],
    },
  })

  const component = (node: ComponentBlock): CosenseComponent => ({
    type: 'cosenseComponent',
    name: node.name,
    attributes: node.attributes,
    fallback: line(node.line, false),
    fallbackEnd: node.closeLine === null ? null : line(node.closeLine, false),
    children: node.children.flatMap(block),
  })

  const block = (node: GroupedBlock): ElementContent[] =>
    node.type === 'component' ? [component(node)] : compileNode(node)

  const blocks: Either.Either<readonly GroupedBlock[], CosenseXError> =
    options.components === undefined
      ? Either.right(page.children)
      : groupComponentsEither(
          page.children as readonly TopLevelBlock[],
          options.components.source,
          options.components.lineOffset,
        )

  return Either.map(
    blocks,
    (grouped): Root => ({
      type: 'root',
      children: [element('div', withClass(cls.page), grouped.flatMap(block))],
    }),
  )
}

/**
 * Cosense の AST (ページ全体) を hast にする。
 * `.csnx` のコンポーネントの開始タグと閉じタグが対応していなければ、例外を投げる。
 */
export const toHast = (page: Page, options: ToHastOptions = {}): Root =>
  orThrow(toHastEither(page, options))
