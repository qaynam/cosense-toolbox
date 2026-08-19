/**
 * to-html.ts — AST を HTML にする公式コンパイラ。
 *
 * ノード型ごとのハンドラの集まりで、`handlers` に渡した型だけが差し替わる
 * (marked の renderer と同じ形)。
 */
import { Match, Option, String as Str, pipe } from 'effect'
import { asImageSrc } from '../core/image-url'
import type {
  AnyNode,
  CodeBlock,
  Decoration,
  Hashtag,
  IconNode,
  InternalLink,
  ProjectLink,
} from '../types'
import { type NodeHandlers, createCompiler } from './create-compiler'

// ---------------------------------------------------------------------------
// エスケープと属性
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** `& < > " '` を実体参照に置き換える。テキストと属性値のどちらにも使える。 */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

/** 属性ひとつ。None なら属性ごと出さない。 */
const attr = (name: string, value: Option.Option<string>): string =>
  Option.match(value, {
    onNone: () => '',
    onSome: (text) => ` ${name}="${escapeHtml(text)}"`,
  })

/** 空文字は「指定なし」とみなす。class 名を空にして属性ごと消せるようにするため。 */
const nonEmpty = (value: string | null | undefined): Option.Option<string> =>
  pipe(Option.fromNullable(value), Option.filter(Str.isNonEmpty))

/** 0 は既定値なので属性にする意味がない。 */
const positive = (value: number): Option.Option<string> =>
  value > 0 ? Option.some(String(value)) : Option.none()

const flag = (on: boolean | undefined): Option.Option<string> =>
  on === true ? Option.some('true') : Option.none()

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

/** 遷移先があるときだけ `<a>` で包む。スキームが安全でなければ包まない。 */
const linked = (html: string, link: string | undefined): string =>
  pipe(
    Option.fromNullable(link),
    Option.flatMap((url) => nonEmpty(safeHref(url))),
    Option.match({
      onNone: () => html,
      onSome: (href) => `<a${attr('href', Option.some(href))}>${html}</a>`,
    }),
  )

// ---------------------------------------------------------------------------
// オプション
// ---------------------------------------------------------------------------

/** プロジェクト内のページを指すノード。本家ではアイコンもユーザーのページへのリンクになる。 */
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
 * コードブロックの中身を色付けする。**戻り値は HTML としてそのまま埋め込まれる**ため、
 * エスケープは実装側の責任になる。
 *
 * `language` はファイル名から推測した名前で、拡張子があればそれ、無ければファイル名全体
 * (`code:hello.js` なら `js`、`code:python` なら `python`)。
 *
 * これを渡すと、コードブロックの本体は 1 行 1 要素ではなく 1 つの要素にまとまる。
 * ハイライタの出力が複数行にまたがるタグを含みうるため。
 */
export type Highlighter = (code: string, language: string) => string

/**
 * 既定のハンドラの振る舞いを変えるオプション。
 *
 * `pageUrl` / `iconImageUrl` / `highlight` は、**記法に書かれていないので AST から導けない**
 * 情報を外から渡すためのもの。残りは出力の見た目を調整する。
 */
export interface HtmlRenderOptions {
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
   * @defaultValue 常に null。本家の画像 URL (`/api/pages/{project}/{user}/icon`) は
   * プロジェクト名を要するが、記法には書かれていないため
   */
  readonly iconImageUrl?: (node: IconNode) => string | null
  /** コードブロックの中身の色付け。 */
  readonly highlight?: Highlighter
  /** 出力する要素に付ける class 名。 */
  readonly classNames?: HtmlClassNames
  /**
   * インデントを本家と同じ要素として書き出す。深さ 1 段につき `pad` が 1 つ並び、
   * その右端に中点が付く。
   *
   * @defaultValue false。深さは行の `data-indent` 属性だけで表す
   */
  readonly showPads?: boolean
}

export interface HtmlOptions extends HtmlRenderOptions {
  /** ノード型ごとの出力の上書き。指定した型だけが差し替わる。 */
  readonly handlers?: NodeHandlers<string>
  /**
   * 出力の先頭に `<style>` 要素として差し込む CSS。
   *
   * @defaultValue undefined。`<style>` を出さない
   */
  readonly style?: string
}

/**
 * ファイル名から言語名を推測する。拡張子があればそれ、無ければファイル名全体。
 * Cosense では `code:python` のように言語名だけを書くこともできるため。
 */
const languageOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.')
  return (dot > 0 ? filename.slice(dot + 1) : filename).toLowerCase()
}

/** ハイライタに渡すコード本体。 */
const rawCodeOf = (node: CodeBlock): string =>
  node.lines.map((codeLine) => codeLine.value).join('\n')

/** 記法に書かれたページタイトル。ノード型ごとに置き場所が違うのをここで吸収する。 */
const pageTitleOf = (node: PageRefNode): string =>
  Match.value(node).pipe(
    Match.when({ type: 'hashtag' }, (tag) => tag.value),
    Match.when({ type: 'icon' }, (icon) => icon.user),
    Match.orElse((link) => link.target),
  )

/**
 * `pageUrl` の既定の実装。`/proj/page` のように区切りを含むタイトルは、
 * 区切りを残したまま各段を encode する。
 */
export const defaultPageUrl = (title: string): string =>
  title.startsWith('/')
    ? title.split('/').map(encodeURIComponent).join('/')
    : `/${encodeURIComponent(title)}`

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

const wrapDecoration = (node: Decoration, inner: string): string =>
  DECORATION_TAGS.filter(([isOn]) => isOn(node)).reduce(
    (html, [, tag]) => `<${tag}>${html}</${tag}>`,
    inner,
  )

// ---------------------------------------------------------------------------
// 既定のハンドラ
// ---------------------------------------------------------------------------

/**
 * 既定のハンドラ一式。`toHtml` はこれに `handlers` を重ねてから走らせるので、
 * 一部だけ差し替えるのに呼ぶ必要はない。既定の出力を包みたいときに使う。
 */
export const createHtmlHandlers = (options: HtmlRenderOptions = {}): NodeHandlers<string> => {
  const cls: HtmlClassNames = { ...defaultClassNames, ...options.classNames }
  const highlight = options.highlight
  const pageUrl = options.pageUrl ?? defaultPageUrl
  const iconImageUrl = options.iconImageUrl ?? (() => null)

  const pageHref = (node: PageRefNode): Option.Option<string> =>
    nonEmpty(safeHref(pageUrl(pageTitleOf(node), node)))

  /** 余白の数がインデントの深さを表し、中点はその右端に付く (本家と同じ形)。 */
  const indentMark = (indent: number): string => {
    const pad = `<span${attr('class', nonEmpty(cls.pad))}> </span>`
    const dot = `<span${attr('class', nonEmpty(cls.dot))}></span>`
    return `<span${attr('class', nonEmpty(cls.indentMark))}>${pad.repeat(indent)}${dot}</span>`
  }

  const anchor = (
    url: Option.Option<string>,
    className: string | undefined,
    label: string,
  ): string => {
    const open = `<a${attr('class', nonEmpty(className))}${attr('href', url)}>`
    return `${open}${escapeHtml(label)}</a>`
  }

  return {
    page: (node, ctx) =>
      `<div${attr('class', nonEmpty(cls.page))}>${ctx.children(node).join('')}</div>`,

    title: (node, ctx) =>
      `<h1${attr('class', nonEmpty(cls.title))}>${ctx.children(node).join('')}</h1>`,

    line: (node, ctx) => {
      const body = ctx.children(node).join('')
      const styled = node.monospace
        ? `<code${attr('class', nonEmpty(cls.monospace))}>${body}</code>`
        : body
      const quoted = node.quote
        ? `<blockquote${attr('class', nonEmpty(cls.quote))}>${styled}</blockquote>`
        : styled
      // 空行も 1 行分の高さを保つ。Cosense では空行が段落の区切りとして意味を持つ。
      const inner = quoted === '' ? '<br>' : quoted
      const mark = options.showPads === true && node.indent > 0 ? indentMark(node.indent) : ''
      const open = `<div${attr('class', nonEmpty(cls.line))}${attr('data-indent', positive(node.indent))}>`
      return `${open}${mark}${inner}</div>`
    },

    /**
     * 1 行 = 1 要素に切る (本家と同じ)。行ごとにインデントを付けられるようにするため。
     * `highlight` があるときだけ、複数行にまたがるタグを壊さないよう本体をまとめる。
     */
    codeBlock: (node, ctx) => {
      const classes = [cls.line, cls.codeBlock].filter((name) => name !== undefined).join(' ')
      const blockLine = (indent: number, inner: string): string =>
        `<div${attr('class', nonEmpty(classes))}${attr('data-indent', positive(indent))}>${inner}</div>`

      // 本体はヘッダより 1 段深い。それより深い字下げは値のほうに残っている。
      const codeBody = (className: string | undefined, inner: string): string =>
        blockLine(node.indent + 1, `<code${attr('class', nonEmpty(className))}>${inner}</code>`)

      const filename = `<span${attr('class', nonEmpty(cls.codeFilename))}>${escapeHtml(node.filename)}</span>`
      const header = blockLine(
        node.indent,
        `<code${attr('class', nonEmpty(cls.codeStart))}>${filename}</code>`,
      )

      if (highlight !== undefined) {
        const className = [cls.codeBody, cls.codeHighlight]
          .filter((name) => name !== undefined)
          .join(' ')
        return header + codeBody(className, highlight(rawCodeOf(node), languageOf(node.filename)))
      }

      return (
        header +
        ctx
          .children(node)
          .map((value) => codeBody(cls.codeBody, value))
          .join('')
      )
    },
    codeLine: (node) => escapeHtml(node.value),

    table: (node, ctx) => {
      const caption = pipe(
        nonEmpty(node.name),
        Option.match({
          onNone: () => '',
          onSome: (name) => `<caption>${escapeHtml(name)}</caption>`,
        }),
      )
      const rows = ctx.children(node).join('')
      return `<table${attr('class', nonEmpty(cls.table))}>${caption}<tbody>${rows}</tbody></table>`
    },
    tableRow: (node, ctx) => `<tr>${ctx.children(node).join('')}</tr>`,
    // Cosense のテーブルにヘッダ行の概念は無いので、1 行目も含めてすべて td。
    tableCell: (node) => `<td>${escapeHtml(node.value)}</td>`,

    text: (node) => escapeHtml(node.value),

    internalLink: (node) => anchor(pageHref(node), cls.internalLink, node.label),
    externalLink: (node) => anchor(nonEmpty(safeHref(node.target)), cls.externalLink, node.label),
    projectLink: (node) => anchor(pageHref(node), cls.projectLink, node.label),
    hashtag: (node) => anchor(pageHref(node), cls.hashtag, `#${node.value}`),

    inlineCode: (node) =>
      `<code${attr('class', nonEmpty(cls.inlineCode))}>${escapeHtml(node.value)}</code>`,

    image: (node) => {
      // Gyazo のページ URL のように、書かれたままでは <img> に入らない URL をここで直す。
      // AST はソースの文字列を保つ約束なので、表示用への変換は描画側の責任になる。
      const src = asImageSrc(node.src) ?? node.src
      const open = `<img${attr('class', nonEmpty(cls.image))}${attr('src', nonEmpty(safeSrc(src)))}`
      return linked(`${open} alt=""${attr('data-large', flag(node.large))}>`, node.link)
    },

    // 本家と同じく、そのユーザーのページへのリンクで画像を包む。
    icon: (node) => {
      const name = escapeHtml(node.user)
      const src = iconImageUrl(node)
      const body =
        src === null
          ? name
          : `<img${attr('class', nonEmpty(cls.icon))}${attr('src', nonEmpty(safeSrc(src)))} alt="${name}" title="${name}">`
      const className = [cls.internalLink, cls.icon].filter((c) => c !== undefined).join(' ')
      const open = `<a${attr('class', nonEmpty(className))}${attr('href', pageHref(node))}>`
      return `${open}${body}</a>`.repeat(node.count)
    },

    // 数式の組版は KaTeX 等の仕事なので、記法を外した中身をそのまま置く。
    formula: (node) =>
      `<span${attr('class', nonEmpty(cls.formula))}>${escapeHtml(node.value)}</span>`,

    decoration: (node, ctx) => {
      const open = `<span${attr('class', nonEmpty(cls.decoration))}${attr('data-size-level', positive(node.sizeLevel))}>`
      return `${open}${wrapDecoration(node, ctx.children(node).join(''))}</span>`
    },
  }
}

/**
 * ページ (または任意のノード) を HTML 文字列にする。
 *
 * テキストと属性値はエスケープし、`javascript:` のようなスキームの URL は属性ごと落とす。
 * `handlers` と `highlight` が返した文字列はそのまま埋め込むので、
 * そこでのエスケープは書いた人の責任になる。
 */
export const toHtml = (node: AnyNode, options: HtmlOptions = {}): string => {
  const handlers: NodeHandlers<string> = { ...createHtmlHandlers(options), ...options.handlers }
  const compile = createCompiler<string>({
    handlers,
    // ハンドラの無いノード (拡張が足した独自ノード) でも中身は落とさない。
    fallback: (other, ctx) => ctx.children(other).join(''),
  })
  const html = compile(node)
  return options.style === undefined ? html : `<style>${options.style}</style>${html}`
}
