/**
 * to-hast.ts — Cosense の AST を hast (HTML の AST) にする。
 *
 * 出力する要素と class 名は `@cosense-toolbox/parser/compile` の `toHtml` と揃える。
 * `@cosense-toolbox/style` がそのまま当たるようにするため。
 * hast にしておけば、rehype のプラグインを通してから JS にできる。
 */
import type {
  IconNode,
  LineBlock,
  Page,
  ParseOptions,
  TopLevelBlock,
} from '@cosense-toolbox/parser'
import {
  type HastContext,
  type HastHandlers,
  type HastOptions,
  type PageRefNode,
  defaultHastHandlers,
  defaultPageUrl,
  safeHref,
  safeSrc,
  toHast as toHastOf,
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

export type { HastHighlighter } from '@cosense-toolbox/parser/compile'

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
 * parser の `toHast` のオプションに、リンクの解決とコンポーネントを足したもの。
 * 描画の規則 (要素と class 名) は parser の `toHast` が持ち、ここでは差分だけを足す。
 * `@cosense-toolbox/style` や `toHtml` の出力とずれないようにするため。
 */
export interface ToHastOptions extends Omit<HastOptions, 'pageUrl'> {
  /**
   * ページを指す記法 (`[title]` / `[/proj/page]` / `#tag` / `[user.icon]`) の遷移先。
   * null を返すとリンクにせず、テキストとして出す。
   *
   * @defaultValue `toHtml` と同じく `/{title}`
   */
  readonly resolveLink?: (node: PageRefNode) => ResolvedLink | null
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

/** 空の class は属性ごと出さない。parser の `toHast` で class 名を空文字にしたときと同じ振る舞い。 */
const withClass = (className: string | undefined, properties: Properties = {}): Properties => {
  const names = classList(className)
  return names.length === 0 ? properties : { className: names, ...properties }
}

/** 記法に書かれたページタイトル。parser の `toHast` と同じ。 */
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
  const { resolveLink = defaultResolveLink, title, components, handlers, ...rest } = options

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

  /**
   * 解決できたらリンク、できなければテキスト。
   * parser の既定 (href の無い <a>) と違い、索引に無いページへのリンクを文字に戻せるようにする。
   */
  const pageRef = (
    node: PageRefNode,
    className: string | undefined,
    label: string,
  ): ElementContent =>
    Option.match(resolve(node), {
      onNone: () => text(label),
      onSome: (resolved) =>
        element('a', withClass(className, { href: resolved.href }), [
          text(resolved.label ?? label),
        ]),
    })

  // Cosense Web と同じく、そのユーザーのページへのリンクで画像を包む。
  const icon = (node: IconNode, ctx: HastContext): ElementContent[] => {
    const cls = ctx.options.classNames
    const src = pipe(
      Option.fromNullable(ctx.options.iconImageUrl(node)),
      Option.flatMap((url) => Option.fromNullable(safeSrc(url))),
      Option.filter((url) => url !== ''),
    )
    const href = resolve(node)
    const className = [cls.internalLink, cls.icon].filter(Boolean).join(' ')
    // 連打の数だけ出す。要素を共有しないよう、1 つずつ作る。
    return Array.from({ length: node.count }, () => {
      const body: ElementContent = Option.match(src, {
        onNone: () => text(node.user),
        onSome: (url) =>
          element('img', withClass(cls.icon, { src: url, alt: node.user, title: node.user })),
      })
      return Option.match(href, {
        onNone: () => body,
        onSome: (resolved) => element('a', withClass(className, { href: resolved.href }), [body]),
      })
    })
  }

  /** 行の途中のコンポーネント。渡されなかったときはタグをテキストのまま出す */
  const inlineComponent = (node: InlineComponent, ctx: HastContext): CosenseComponent => ({
    type: 'cosenseComponent',
    name: node.name,
    attributes: node.attributes,
    fallback: text(node.open),
    fallbackEnd: node.close === null ? null : text(node.close),
    children: node.children.flatMap((part) => inlinePart(part, ctx)),
  })

  const inlinePart = (node: InlinePart, ctx: HastContext): ElementContent[] =>
    node.type === 'inlineComponent' ? [inlineComponent(node, ctx)] : ctx.node(node)

  /**
   * 1 行。`.csnx` なら行の途中のコンポーネントを読む。
   * 行の包み方 (引用・等幅・空行・インデント) は parser の既定の `line` に任せ、中身だけを差し替える。
   */
  const line = (node: LineBlock, ctx: HastContext): ElementContent[] => {
    const found =
      components === undefined
        ? Option.none()
        : inlineComponentsOf(node, components.source, components)
    return Option.match(found, {
      onNone: () => defaultHastHandlers.line(node, ctx),
      onSome: ({ parts, warnings }) => {
        for (const warning of warnings) components?.onWarning?.(warning)
        const body = parts.flatMap((part) => inlinePart(part, ctx))
        return defaultHastHandlers.line(node, { ...ctx, children: () => body })
      },
    })
  }

  /**
   * 行ごとのコンポーネント。開始タグと閉じタグだけの行は、行の途中のタグとして読み直さないよう
   * parser の既定の `line` で出す。
   */
  const component = (node: ComponentBlock, ctx: HastContext): CosenseComponent => ({
    type: 'cosenseComponent',
    name: node.name,
    attributes: node.attributes,
    fallback: tagLine(node.line, ctx),
    fallbackEnd: node.closeLine === null ? null : tagLine(node.closeLine, ctx),
    children: node.children.flatMap((child) => block(child, ctx)),
  })

  /** タグだけの行の要素。既定の `line` は行ごとに要素を 1 つ返すので、それを取り出す。 */
  const tagLine = (node: LineBlock, ctx: HastContext): ElementContent =>
    pipe(
      Option.fromNullable(defaultHastHandlers.line(node, ctx)[0]),
      Option.getOrElse(() => text('')),
    )

  const block = (node: GroupedBlock, ctx: HastContext): ElementContent[] =>
    node.type === 'component' ? [component(node, ctx)] : ctx.node(node)

  const blocks: Either.Either<readonly GroupedBlock[], CosenseXError> =
    components === undefined
      ? Either.right(page.children)
      : groupComponentsEither(
          page.children as readonly TopLevelBlock[],
          components.source,
          components.lineOffset,
        )

  return Either.map(blocks, (grouped): Root => {
    const cosenseHandlers: HastHandlers = {
      // コンポーネントは複数の行をまたぐので、ページの子をまとめ直したものを出す。
      page: (_node, ctx) => [
        element(
          'div',
          withClass(ctx.options.classNames.page),
          grouped.flatMap((child) => block(child, ctx)),
        ),
      ],
      ...(title === false ? { title: () => [] } : {}),
      line,
      internalLink: (node, ctx) => [pageRef(node, ctx.options.classNames.internalLink, node.label)],
      projectLink: (node, ctx) => [pageRef(node, ctx.options.classNames.projectLink, node.label)],
      hashtag: (node, ctx) => [pageRef(node, ctx.options.classNames.hashtag, `#${node.value}`)],
      icon,
    }
    // 利用者の handlers は最後に重ねるので、cosense-x が差し替えたものも上書きできる。
    return toHastOf(page, { ...rest, handlers: { ...cosenseHandlers, ...handlers } })
  })
}

/**
 * Cosense の AST (ページ全体) を hast にする。
 * `.csnx` のコンポーネントの開始タグと閉じタグが対応していなければ、例外を投げる。
 */
export const toHast = (page: Page, options: ToHastOptions = {}): Root =>
  orThrow(toHastEither(page, options))
