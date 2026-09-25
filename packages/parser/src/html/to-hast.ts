/**
 * to-hast.ts — AST を hast (HTML の AST) にする公式コンパイラ。
 *
 * HTML の文字列 (`toHtml`)、JSX (cosense-x)、rehype のプラグインはすべてこの出力から作る。
 * 描画の規則をここ 1 か所に置き、形式ごとに実装が分かれてずれないようにするため。
 *
 * ノード型ごとのハンドラの集まりで、`handlers` に渡した型だけが差し替わる。
 * 既定のハンドラは `defaultHastHandlers` として公開し、オプションは `ctx.options` から読む。
 * 利用者が既定の出力を包むとき、オプションを渡し直さなくて済むようにするため。
 */
import { Match, Option, pipe } from 'effect'
import type { Element, ElementContent, Properties, Root, Text } from 'hast'
import { childrenOf } from '../ast'
import { asImageSrc } from '../core/image-url'
import type {
  AnyNode,
  AnyNodeType,
  CodeBlock,
  Decoration,
  Hashtag,
  IconNode,
  InternalLink,
  NodeOfType,
  ProjectLink,
} from '../types'

// ---------------------------------------------------------------------------
// URL の検査
// ---------------------------------------------------------------------------

/** `href` に入れると script が動くスキーム。`data:text/html` があるので data: も拒む。 */
const UNSAFE_HREF_RE = /^(?:javascript|vbscript|data):/

/** `src` に入れると script が動くスキーム。`data:` 画像は正当な使い道があるので許す。 */
const UNSAFE_SRC_RE = /^(?:javascript|vbscript):/

/**
 * スキームだけを見るために空白と制御文字を落とす。
 * ブラウザは途中にタブや改行が挟まった `javascript:` もスキームとして解釈するため。
 */
const schemeOf = (url: string): string => url.replace(/[\s\p{Cc}]/gu, '').toLowerCase()

const safeUrl = (url: string, unsafe: RegExp): string | null =>
  unsafe.test(schemeOf(url)) ? null : url

/** `href` に入れて安全な URL だけを返す。script が動くスキームなら null。 */
export const safeHref = (url: string): string | null => safeUrl(url, UNSAFE_HREF_RE)

/** `src` に入れて安全な URL だけを返す。script が動くスキームなら null。 */
export const safeSrc = (url: string): string | null => safeUrl(url, UNSAFE_SRC_RE)

/** 空文字は「指定なし」とみなす。class 名や URL を空にして属性ごと消せるようにするため。 */
const nonEmpty = (value: string | null | undefined): Option.Option<string> =>
  pipe(
    Option.fromNullable(value),
    Option.filter((text) => text !== ''),
  )

// ---------------------------------------------------------------------------
// オプション
// ---------------------------------------------------------------------------

/** プロジェクト内のページを指すノード。Cosense Web ではアイコンもユーザーのページへのリンクになる。 */
export type PageRefNode = InternalLink | ProjectLink | Hashtag | IconNode

/**
 * 出力する要素に付ける class 名。指定したキーだけが既定を上書きする。
 * 空文字にすると class 属性自体を出さない。
 */
export interface HtmlClassNames {
  readonly page?: string
  readonly title?: string
  readonly line?: string
  /** 引用行の `<blockquote>` */
  readonly quote?: string
  /** 等幅行の `<code>` */
  readonly monospace?: string
  /** コードブロックに属する行 (ヘッダ行と本体行の両方) */
  readonly codeBlock?: string
  /** ヘッダ行の `<code>` */
  readonly codeStart?: string
  /** ヘッダ行に出るファイル名 */
  readonly codeFilename?: string
  /** 本体行の `<code>` */
  readonly codeBody?: string
  /** ハイライタを通した本体に追加で付く class */
  readonly codeHighlight?: string
  readonly table?: string
  /** `showPads` のときだけ出る、インデントぶんの余白と中点をまとめる要素 */
  readonly indentMark?: string
  /** インデント 1 段ぶんの余白 */
  readonly pad?: string
  /** インデントの右端に置く中点 */
  readonly dot?: string
  readonly internalLink?: string
  readonly externalLink?: string
  readonly projectLink?: string
  readonly hashtag?: string
  readonly inlineCode?: string
  readonly image?: string
  readonly icon?: string
  readonly formula?: string
  readonly decoration?: string
}

/** 既定の class 名。接頭辞を持たないため、利用側の CSS と名前がぶつかりうる。 */
export const defaultClassNames: HtmlClassNames = {
  page: 'page',
  title: 'title',
  line: 'line',
  quote: 'quote',
  monospace: 'monospace',
  codeBlock: 'code-block',
  codeStart: 'code-start',
  codeFilename: 'code-block-start',
  codeBody: 'code-body',
  codeHighlight: 'highlight',
  table: 'table',
  indentMark: 'indent-mark',
  pad: 'pad',
  dot: 'dot',
  internalLink: 'link',
  externalLink: 'link link-external',
  projectLink: 'link link-project',
  hashtag: 'hashtag',
  inlineCode: 'code',
  image: 'image',
  icon: 'icon',
  formula: 'formula',
  decoration: 'decoration',
}

/**
 * HTML の文字列をそのまま入れるノード。`toHtml` はそのまま埋め込む (hast-util-to-html の raw ノード)。
 * hast の型には無いので、ここで持つ。hast-util-to-html の型拡張に頼ると、
 * `@types/hast` の版が分かれたときに型が合わなくなるため。
 */
export interface RawNode {
  readonly type: 'raw'
  readonly value: string
}

/** ハンドラやハイライタが返せるノード。hast の要素の中身か、raw ノード。 */
export type HastContent = ElementContent | RawNode

/**
 * コードブロックの中身を色付けする。
 *
 * `language` はファイル名から推測した名前 (`codeLanguageOf`)。
 * null を返すと色付けせず、1 行ずつのまま出す。知らない言語のときに使う。
 *
 * shiki の `codeToHast` のように `pre > code` を返したときは、code の中身を使い、
 * pre の class と style (テーマの背景色や文字色) をコードブロックの code に移す。
 * 行の要素 (`div.line`) の中に置くので、pre そのものは出さない。
 */
export type HastHighlighter = (code: string, language: string) => Root | HastContent[] | null

/**
 * 既定のハンドラの振る舞いを変えるオプション。
 *
 * `pageUrl` / `iconImageUrl` / `highlight` は、**記法に書かれていないので AST から導けない**
 * 情報を外から渡すためのもの。残りは出力の見た目を調整する。
 */
export interface HastRenderOptions {
  /**
   * ページを指す記法 (`[title]` / `[/proj/page]` / `#tag` / `[user.icon]`) の遷移先。
   * アイコンについてはリンク先だけを決め、画像は `iconImageUrl` が決める。
   *
   * `title` は記法に書かれたタイトルそのままで、`[title]` なら `title`、
   * `[/proj/page]` なら `/proj/page`、`#tag` なら `tag`、`[user.icon]` なら `user`。
   *
   * @defaultValue `/{title}`。区切りを含むタイトルは区切りを残して各段を encode する
   */
  readonly pageUrl?: (title: string, node: PageRefNode) => string
  /**
   * アイコンの画像 URL。null なら `<img>` を出さず、ユーザー名のテキストになる。
   * リンク先のほうは `pageUrl` が決める。
   *
   * @defaultValue 常に null。Cosense Web の画像 URL (`/api/pages/{project}/{user}/icon`) は
   * プロジェクト名を要するが、記法には書かれていないため
   */
  readonly iconImageUrl?: (node: IconNode) => string | null
  /**
   * コードブロックの中身の色付け。渡すと、本体は 1 行 1 要素ではなく 1 つの要素にまとまる。
   * ハイライタの出力が複数行にまたがる要素を含みうるため。
   */
  readonly highlight?: HastHighlighter
  /** 出力する要素に付ける class 名。 */
  readonly classNames?: HtmlClassNames
  /**
   * インデントを Cosense Web と同じ要素として書き出す。深さ 1 段につき `pad` が 1 つ並び、
   * その右端に中点が付く。
   *
   * @defaultValue false。深さは行の `data-indent` 属性だけで表す
   */
  readonly showPads?: boolean
}

/** オプションの既定値を埋めたもの。ハンドラは `ctx.options` でこれを読む。 */
export interface ResolvedHastOptions {
  readonly pageUrl: (title: string, node: PageRefNode) => string
  readonly iconImageUrl: (node: IconNode) => string | null
  readonly highlight: HastHighlighter | null
  /** 既定の class 名に、指定したものを重ねたもの */
  readonly classNames: HtmlClassNames
  readonly showPads: boolean
}

/** ハンドラの中から再帰的に変換するための入口と、オプション。 */
export interface HastContext {
  /**
   * 今描いているノードの祖先。根 (`toHast` に渡したノード) から親までの順に並ぶ。
   * 「テーブルのセルの中の text だけ」のように、どこにあるかで出力を変えるときに使う。
   */
  readonly ancestors: readonly AnyNode[]
  /** ノード 1 つを変換する (そのノード型のハンドラを通る) */
  readonly node: (node: AnyNode) => ElementContent[]
  /** 子ノードをすべて変換し、平らな配列で返す */
  readonly children: (node: AnyNode) => ElementContent[]
  readonly options: ResolvedHastOptions
}

export type HastHandler<K extends AnyNodeType> = (
  node: NodeOfType<K>,
  ctx: HastContext,
) => HastContent | HastContent[]

/**
 * ノード型 → ハンドラの対応。`AnyNodeMap` から型を導出しているので、
 * ノード型が増えたら (declaration merging を含む) ここも自動で新しいキーを受け入れる。
 */
export type HastHandlers = {
  readonly [K in AnyNodeType]?: HastHandler<K>
}

/**
 * 描画の拡張の 1 段。そのノード型の、ここまでの出力 (既定のハンドラか `handlers`、
 * 先に並べた拡張を通したもの) を受け取り、新しい出力を返す。
 * vite の `transform` と同じく、前の段の出力をもらって加工するだけの関数にしている。
 * 出力を一から作るのは `handlers` の役目なので、拡張では作り直さない。
 */
export type RenderTransform<K extends AnyNodeType> = (
  output: ElementContent[],
  node: NodeOfType<K>,
  ctx: HastContext,
) => HastContent | HastContent[]

/**
 * 描画の拡張。ノード型ごとに `RenderTransform` を持つ。
 * 行番号 (`codeLineNumbers`) のように、既定の出力に手を加えるものをまとめて配るための形。
 */
export type RenderExtension = {
  readonly [K in AnyNodeType]?: RenderTransform<K>
}

export interface HastOptions extends HastRenderOptions {
  /**
   * ノード型ごとの出力の置き換え。指定した型だけが差し替わる。
   * 出力を一から作りたいときに使う。できた出力に手を加えるだけなら `extensions` を使う。
   */
  readonly handlers?: HastHandlers
  /**
   * 描画の拡張。`handlers` の後に、並べた順に出力を加工する。
   * 前の拡張の出力が次の拡張に渡るので、同じノード型に触る拡張どうしも重ねられる。
   */
  readonly extensions?: readonly RenderExtension[]
}

/**
 * コードブロックのファイル名から言語名を推測する。拡張子があればそれ、無ければファイル名全体。
 * Cosense では `code:python` のように言語名だけを書くこともできるため。
 * `highlight` に渡る言語名はこれで決めている。
 */
export const codeLanguageOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.')
  return (dot > 0 ? filename.slice(dot + 1) : filename).toLowerCase()
}

/**
 * `pageUrl` の既定の実装。`/proj/page` のように区切りを含むタイトルは、
 * 区切りを残したまま各段を encode する。
 */
export const defaultPageUrl = (title: string): string =>
  title.startsWith('/')
    ? title.split('/').map(encodeURIComponent).join('/')
    : `/${encodeURIComponent(title)}`

/** 記法に書かれたページタイトル。ノード型ごとに置き場所が違うのをここで吸収する。 */
const pageTitleOf = (node: PageRefNode): string =>
  Match.value(node).pipe(
    Match.when({ type: 'hashtag' }, (tag) => tag.value),
    Match.when({ type: 'icon' }, (icon) => icon.user),
    Match.orElse((link) => link.target),
  )

// ---------------------------------------------------------------------------
// hast の組み立て
// ---------------------------------------------------------------------------

const text = (value: string): Text => ({ type: 'text', value })

const classList = (name: string | undefined): string[] =>
  name === undefined ? [] : name.split(/\s+/).filter((part) => part !== '')

const element = (
  tagName: string,
  properties: Properties,
  children: ElementContent[] = [],
): Element => ({ type: 'element', tagName, properties, children })

/** 値が undefined のプロパティは出さない (`exactOptionalPropertyTypes` と同じ考え)。 */
const compact = (properties: Properties): Properties =>
  Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined))

/** 空の class は属性ごと出さない。class 名を空文字にして消せるようにするため。 */
const withClass = (className: string | undefined, properties: Properties = {}): Properties => {
  const names = classList(className)
  return names.length === 0 ? compact(properties) : { className: names, ...compact(properties) }
}

/** 0 は既定値なので属性にしない。 */
const positive = (value: number): number | undefined => (value > 0 ? value : undefined)

/** 複数の class 名の設定を 1 つにつなぐ。未設定のものは飛ばす。 */
const joinClasses = (...names: (string | undefined)[]): string =>
  names.filter((name) => name !== undefined).join(' ')

/** ページを指すノードの遷移先。安全でなければ null (href を出さない)。 */
const pageHrefOf = (node: PageRefNode, options: ResolvedHastOptions): string | undefined =>
  Option.getOrUndefined(nonEmpty(safeHref(options.pageUrl(pageTitleOf(node), node))))

const anchor = (className: string | undefined, href: string | undefined, label: string): Element =>
  element('a', withClass(className, { href }), [text(label)])

/**
 * 装飾を表す要素を、内側から外側の順に並べたもの。
 *
 * Cosense では 1 つの記法が複数の装飾を同時に持つ (`[-/ x]` は打消しかつ斜体) ので、
 * フラグの集合を入れ子の要素に開いて表現する。
 */
const DECORATION_TAGS: readonly (readonly [(node: Decoration) => boolean, string])[] = [
  [(node) => node.strike, 's'],
  [(node) => node.underline, 'u'],
  [(node) => node.italic, 'em'],
  [(node) => node.bold, 'strong'],
]

/** 余白の数がインデントの深さを表し、中点はその右端に付く (Cosense Web と同じ形)。 */
const indentMark = (indent: number, cls: HtmlClassNames): Element =>
  element('span', withClass(cls.indentMark), [
    ...Array.from({ length: indent }, () => element('span', withClass(cls.pad), [text(' ')])),
    element('span', withClass(cls.dot)),
  ])

/** 色付けした本体と、コードブロックの code に足す class と style。 */
interface HighlightedBody {
  readonly children: ElementContent[]
  readonly className: readonly string[]
  readonly style: string | undefined
}

/**
 * raw ノードを hast の要素の中身として扱う。型の変換はここ 1 か所に閉じる。
 *
 * hast の型は raw を知らない。raw の型拡張は mdast-util-to-hast が持っているが、
 * それに頼ると利用者の環境で型が効くかどうかが依存の入り方で変わるので、`RawNode` を自前で持っている。
 * 実行時には、文字列にするとき (hast-util-to-html の allowDangerousHtml) にそのまま埋め込まれる。
 */
const asElementContents = (nodes: readonly HastContent[]): ElementContent[] =>
  nodes as ElementContent[]

/** 要素の中身に入るノードだけにする。Root の子には doctype も来うるため。 */
const contentsOf = (result: Root | HastContent[]): ElementContent[] =>
  Array.isArray(result)
    ? asElementContents(result)
    : result.children.filter((child): child is ElementContent => child.type !== 'doctype')

const isBlank = (node: ElementContent): boolean => node.type === 'text' && node.value.trim() === ''

/** 空白だけのテキストを除いた、ただ 1 つの子。 */
const onlyChildOf = (children: readonly ElementContent[]): Option.Option<ElementContent> =>
  pipe(
    Option.some(children.filter((child) => !isBlank(child))),
    Option.filter((meaningful) => meaningful.length === 1),
    Option.flatMapNullable((meaningful) => meaningful[0]),
  )

const elementNamed =
  (tagName: string) =>
  (node: ElementContent): Option.Option<Element> =>
    Option.liftPredicate(
      node,
      (content): content is Element => content.type === 'element' && content.tagName === tagName,
    )

/** hast の決まりでは className は配列だが、shiki は class を文字列で付ける。どちらも読む。 */
const classesOf = (value: Properties[string]): string[] =>
  Match.value(value).pipe(
    Match.when(Array.isArray, (names) => names.map(String)),
    Match.when(Match.string, classList),
    Match.orElse(() => []),
  )

/**
 * ハイライタの出力をコードブロックの code の中身にする。
 * `pre > code` (shiki や lowlight の形) なら pre を剥がし、pre に付いたテーマの class と style を引き継ぐ。
 */
const highlightedBody = (result: Root | HastContent[]): HighlightedBody => {
  const children = contentsOf(result)
  return pipe(
    onlyChildOf(children),
    Option.flatMap(elementNamed('pre')),
    Option.flatMap((pre) =>
      pipe(
        onlyChildOf(pre.children),
        Option.flatMap(elementNamed('code')),
        Option.map(
          (code): HighlightedBody => ({
            children: code.children,
            className: classesOf(pre.properties.className ?? pre.properties.class),
            style: typeof pre.properties.style === 'string' ? pre.properties.style : undefined,
          }),
        ),
      ),
    ),
    Option.getOrElse((): HighlightedBody => ({ children, className: [], style: undefined })),
  )
}

/**
 * ハイライタの出力が行ごとの要素 (shiki の `span.line`) に分かれていれば、それを行の数だけ返す。
 * 行の区切りの改行 (空白だけのテキスト) は、行を別の要素にするので要らない。
 */
const linesOf = (
  children: readonly ElementContent[],
  count: number,
): Option.Option<readonly Element[]> => {
  const isLine = (child: ElementContent): child is Element =>
    child.type === 'element' &&
    classesOf(child.properties.className ?? child.properties.class).includes('line')
  return Option.liftPredicate(
    children.filter((child) => !isBlank(child)),
    (lines): lines is Element[] => lines.length === count && lines.every(isLine),
  )
}

/** style.css がコードブロックの背景と文字の色に使う変数。 */
const THEME_VARIABLES: Readonly<Record<string, string>> = {
  'background-color': '--cosense-code-bg',
  color: '--cosense-code-text',
}

/**
 * テーマの背景色と文字色 (shiki が pre に付ける style) を、style.css の変数に読み替える。
 * そのまま style に置くと、利用者の CSS から上書きするのに !important が要るため。
 * 変数なら、テーマの色は既定として出しつつ、普通の CSS で塗り替えられる。
 */
const themeStyleOf = (style: string | undefined): string | undefined =>
  pipe(
    Option.fromNullable(style),
    Option.map((declarations) =>
      declarations
        .split(';')
        .flatMap((declaration) => Option.toArray(themeDeclarationOf(declaration)))
        .join(';'),
    ),
    Option.getOrUndefined,
  )

/** `name: value` の 1 つ。`:` の無い壊れた宣言は落とす。 */
const themeDeclarationOf = (declaration: string): Option.Option<string> =>
  pipe(
    Option.some(declaration.indexOf(':')),
    Option.filter((colon) => colon > 0),
    Option.map((colon) => {
      const name = declaration.slice(0, colon).trim()
      const variable = Option.getOrElse(Option.fromNullable(THEME_VARIABLES[name]), () => name)
      return `${variable}:${declaration.slice(colon + 1).trim()}`
    }),
  )

/**
 * 1 行 = 1 要素に切る (Cosense Web と同じ)。行ごとにインデントを付けられるようにするため。
 * `highlight` があるときだけ、複数行にまたがる要素を壊さないよう本体をまとめる。
 */
const codeBlock = (node: CodeBlock, ctx: HastContext): ElementContent[] => {
  const cls = ctx.options.classNames
  const classes = joinClasses(cls.line, cls.codeBlock)
  const blockLine = (indent: number, child: Element): Element =>
    element('div', withClass(classes, { dataIndent: positive(indent) }), [child])
  const filename = element('span', withClass(cls.codeFilename), [text(node.filename)])
  const header = blockLine(node.indent, element('code', withClass(cls.codeStart), [filename]))

  // 本体はヘッダより 1 段深い。それより深い字下げは値のほうに残っている。
  const bodyLine = (
    className: string | undefined,
    properties: Properties,
    children: ElementContent[],
  ) => blockLine(node.indent + 1, element('code', withClass(className, properties), children))

  const highlighted = pipe(
    Option.fromNullable(ctx.options.highlight),
    // 例外を投げたら、そのブロックは色付けしない。shiki は読み込んでいない言語で投げるので、
    // 1 つのブロックのためにページ全体の描画を落とさないようにする。
    Option.flatMap((highlight) =>
      Option.liftThrowable(highlight)(
        node.lines.map((codeLine) => codeLine.value).join('\n'),
        codeLanguageOf(node.filename),
      ),
    ),
    Option.flatMapNullable((result) => result),
    Option.map(highlightedBody),
  )

  return Option.match(highlighted, {
    onNone: () => [
      header,
      ...node.lines.map((codeLine) => bodyLine(cls.codeBody, {}, ctx.node(codeLine))),
    ],
    onSome: ({ children, className, style }) => {
      const names = joinClasses(cls.codeBody, cls.codeHighlight, ...className)
      const properties = { style: themeStyleOf(style) }
      return Option.match(linesOf(children, node.lines.length), {
        // 行ごとに分かれた出力 (shiki) は、色付けしないときと同じく 1 行ずつの要素に入れ直す。
        // 行ごとのインデントや行番号を、外側の行の要素に付けられるようにするため。
        onSome: (lines) => [header, ...lines.map((line) => bodyLine(names, properties, [line]))],
        // 行をまたぐ出力 (highlight.js など) は、壊さないようひと塊のまま出す。
        onNone: () => [header, bodyLine(names, properties, children)],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// 既定のハンドラ
// ---------------------------------------------------------------------------

/**
 * 既定のハンドラ一式。`toHast` はこれに `handlers` を重ねてから走らせる。
 *
 * cosense-x のように描画を組み立て直すライブラリが、既定の部品 (行の包み方など) を使い回すためのもの。
 * 既定の出力に手を加えるだけなら、これを呼ばずに `extensions` を使う。
 * オプションは `ctx.options` から読むので、呼ぶ側が渡し直さなくてよい。
 */
export const defaultHastHandlers = {
  page: (node, ctx) => [element('div', withClass(ctx.options.classNames.page), ctx.children(node))],

  title: (node, ctx) => [
    element('h1', withClass(ctx.options.classNames.title), ctx.children(node)),
  ],

  line: (node, ctx) => {
    const cls = ctx.options.classNames
    const body = ctx.children(node)
    const styled = node.monospace ? [element('code', withClass(cls.monospace), body)] : body
    const quoted = node.quote ? [element('blockquote', withClass(cls.quote), styled)] : styled
    // 空行も 1 行分の高さを保つ。Cosense では空行が段落の区切りとして意味を持つ。
    const inner = quoted.length === 0 ? [element('br', {})] : quoted
    const mark = ctx.options.showPads && node.indent > 0 ? [indentMark(node.indent, cls)] : []
    return [
      element('div', withClass(cls.line, { dataIndent: positive(node.indent) }), [
        ...mark,
        ...inner,
      ]),
    ]
  },

  codeBlock,
  codeLine: (node) => [text(node.value)],

  table: (node, ctx) => {
    const caption = node.name === '' ? [] : [element('caption', {}, [text(node.name)])]
    return [
      element('table', withClass(ctx.options.classNames.table), [
        ...caption,
        element('tbody', {}, ctx.children(node)),
      ]),
    ]
  },
  tableRow: (node, ctx) => [element('tr', {}, ctx.children(node))],
  // Cosense のテーブルにヘッダ行の概念は無いので、1 行目も含めてすべて td。
  tableCell: (node, ctx) => [element('td', {}, ctx.children(node))],

  text: (node) => [text(node.value)],

  internalLink: (node, ctx) => [
    anchor(ctx.options.classNames.internalLink, pageHrefOf(node, ctx.options), node.label),
  ],
  externalLink: (node, ctx) => [
    anchor(
      ctx.options.classNames.externalLink,
      Option.getOrUndefined(nonEmpty(safeHref(node.target))),
      node.label,
    ),
  ],
  projectLink: (node, ctx) => [
    anchor(ctx.options.classNames.projectLink, pageHrefOf(node, ctx.options), node.label),
  ],
  hashtag: (node, ctx) => [
    anchor(ctx.options.classNames.hashtag, pageHrefOf(node, ctx.options), `#${node.value}`),
  ],

  inlineCode: (node, ctx) => [
    element('code', withClass(ctx.options.classNames.inlineCode), [text(node.value)]),
  ],

  image: (node, ctx) => {
    // Gyazo のページ URL のように、書かれたままでは <img> に入らない URL をここで直す。
    // AST はソースの文字列を保つ約束なので、表示用への変換は描画側の責任になる。
    const src = Option.getOrUndefined(nonEmpty(safeSrc(asImageSrc(node.src) ?? node.src)))
    const img = element(
      'img',
      withClass(ctx.options.classNames.image, {
        src,
        alt: '',
        dataLarge: node.large ? 'true' : undefined,
      }),
    )
    // 遷移先があるときだけ <a> で包む。スキームが安全でなければ包まない。
    const href = pipe(
      Option.fromNullable(node.link),
      Option.flatMap((link) => nonEmpty(safeHref(link))),
    )
    return [
      Option.match(href, {
        onNone: () => img,
        onSome: (url) => element('a', { href: url }, [img]),
      }),
    ]
  },

  // Cosense Web と同じく、そのユーザーのページへのリンクで画像を包む。
  icon: (node, ctx) => {
    const cls = ctx.options.classNames
    const src = pipe(
      Option.fromNullable(ctx.options.iconImageUrl(node)),
      Option.flatMap((url) => nonEmpty(safeSrc(url))),
    )
    const href = pageHrefOf(node, ctx.options)
    // 連打の数だけ出す。要素を共有しないよう、1 つずつ作る。
    return Array.from({ length: node.count }, () => {
      const body: ElementContent = Option.match(src, {
        onNone: () => text(node.user),
        onSome: (url) =>
          element('img', withClass(cls.icon, { src: url, alt: node.user, title: node.user })),
      })
      return element('a', withClass(joinClasses(cls.internalLink, cls.icon), { href }), [body])
    })
  },

  // 数式の組版は KaTeX 等の仕事なので、記法を外した中身をそのまま置く。
  formula: (node, ctx) => [
    element('span', withClass(ctx.options.classNames.formula), [text(node.value)]),
  ],

  decoration: (node, ctx) => {
    const inner = DECORATION_TAGS.filter(([isOn]) => isOn(node)).reduce<ElementContent[]>(
      (wrapped, [, tag]) => [element(tag, {}, wrapped)],
      ctx.children(node),
    )
    // Cosense Web と同じく記号ごとの class も出す。意味を持たない記号を userCSS で
    // 拾えるようにするためのもので、`classNames.decoration` とは別に常に付く。
    const names = joinClasses(
      ctx.options.classNames.decoration,
      ...node.markers.map((marker) => `deco-${marker}`),
    )
    return [element('span', withClass(names, { dataSizeLevel: positive(node.sizeLevel) }), inner)]
  },
} satisfies HastHandlers

/** オプションの既定値を埋める。 */
const resolveOptions = (options: HastRenderOptions): ResolvedHastOptions => ({
  pageUrl: options.pageUrl ?? defaultPageUrl,
  iconImageUrl: options.iconImageUrl ?? (() => null),
  highlight: options.highlight ?? null,
  classNames: { ...defaultClassNames, ...options.classNames },
  showPads: options.showPads === true,
})

/** ハンドラや拡張の戻り値 (1 つか配列) を、要素の中身の配列にする。 */
const contentsOfResult = (result: HastContent | HastContent[]): ElementContent[] =>
  asElementContents(Array.isArray(result) ? result : [result])

/**
 * ノード型で表 (ハンドラや拡張) を引く。
 * 表の関数の型はキーごとに違うが、ノードの `type` でキーを引いている以上一致するので、型はここ 1 か所で合わせる。
 */
const entryOf = <F>(table: object, type: AnyNodeType): Option.Option<F> =>
  Option.fromNullable((table as Readonly<Record<string, F | undefined>>)[type])

/**
 * ページ (または任意のノード) を hast にする。
 *
 * 1 つのノードは「既定のハンドラ (`handlers` があれば置き換え)」で作り、`extensions` を並べた順に通す。
 * テキストは hast のテキストノードに入れるだけなので、エスケープは文字列にする側 (`toHtml`) が行う。
 * `javascript:` のようなスキームの URL は属性ごと落とす。
 * ハンドラの無いノード型 (拡張が足した独自ノード) は、中身を落とさずに子だけを出す。
 */
export const toHast = (node: AnyNode, options: HastOptions = {}): Root => {
  const handlers: HastHandlers = { ...defaultHastHandlers, ...options.handlers }
  const extensions = options.extensions ?? []

  const resolved = resolveOptions(options)

  const render = (target: AnyNode, ctx: HastContext): ElementContent[] =>
    pipe(
      entryOf<HastHandler<AnyNodeType>>(handlers, target.type),
      Option.match({
        onNone: () => ctx.children(target),
        onSome: (handler) => contentsOfResult(handler(target, ctx)),
      }),
    )

  const extend = (target: AnyNode, output: ElementContent[], ctx: HastContext): ElementContent[] =>
    extensions.reduce(
      (current, extension) =>
        pipe(
          entryOf<RenderTransform<AnyNodeType>>(extension, target.type),
          Option.match({
            onNone: () => current,
            onSome: (transform) => contentsOfResult(transform(current, target, ctx)),
          }),
        ),
      output,
    )

  /**
   * `target` を描くときの文脈。`ctx.node` / `ctx.children` で描くノードは、
   * 渡したノードに依らず `target` の下にあるものとして描く。
   * ハンドラが中身を差し替えた写し (`{ ...node, children }`) を渡しても、祖先が重ならないようにするため。
   */
  const contextOf = (target: AnyNode, ancestors: readonly AnyNode[]): HastContext => {
    const inside = [...ancestors, target]
    return {
      ancestors,
      node: (child) => compile(child, inside),
      children: (parent) => childrenOf(parent).flatMap((child) => compile(child, inside)),
      options: resolved,
    }
  }

  const compile = (target: AnyNode, ancestors: readonly AnyNode[]): ElementContent[] => {
    const ctx = contextOf(target, ancestors)
    return extend(target, render(target, ctx), ctx)
  }

  return { type: 'root', children: compile(node, []) }
}
