/**
 * to-mdast.ts — AST を mdast (Markdown の AST) にする。
 *
 * Markdown の文字列 (`toMarkdown`) と remark のプラグインはこの出力から作る。
 * Markdown に移す規則をここ 1 か所に置き、エスケープのような書き出しの規則は mdast-util-to-markdown に任せる。
 *
 * Cosense は 1 行が 1 つの単位で、Markdown はブロック (段落・箇条書き) が単位なので、
 * 行を順に変換したあと、続いている行をブロックにまとめる。
 * - 字下げの無い行が続けば 1 つの段落 (行の区切りは改行のまま残す)。空行が段落を区切る
 * - 引用の行が続けば 1 つの引用
 * - 字下げした行 (コードブロックと表を含む) が続けば、字下げの深さを入れ子にした 1 つの箇条書き
 */
import { Match, Option, pipe } from "effect"
import type {
  BlockContent,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  Text,
} from "mdast"
import type {} from "mdast-util-math"

import { childrenOf } from "../ast"
import { toPlainText } from "../compile/to-plain-text"
import { codeLanguageOf } from "../core/code-language"
import { asImageSrc } from "../core/image-url"
import { asMapUrl } from "../core/map-url"
import { defaultPageUrl, type PageRefNode, pageTitleOf } from "../core/page-ref"
import { safeHref, safeSrc } from "../core/safe-url"
import type {
  AnyNode,
  CodeBlock,
  Decoration,
  IconNode,
  LineBlock,
  TableBlock,
  TopLevelBlock,
} from "../types"

// ---------------------------------------------------------------------------
// オプション
// ---------------------------------------------------------------------------

export interface MdastOptions {
  /**
   * ページを指す記法 (`[title]` / `[/proj/page]` / `#tag` / `[user.icon]`) のリンク先。
   * `title` の意味は `toHast` の `pageUrl` と同じ。
   *
   * @defaultValue `/{title}`。区切りを含むタイトルは区切りを残して各段を encode する
   */
  readonly pageUrl?: (title: string, node: PageRefNode) => string
  /**
   * アイコンの画像 URL。null ならユーザー名のテキストになる。
   *
   * @defaultValue 常に null。Cosense Web の画像 URL はプロジェクト名を要するが、記法には書かれていないため
   */
  readonly iconImageUrl?: (node: IconNode) => string | null
  /**
   * 行全体が大きい文字の装飾 (`[** ]` 以上) のとき、それをどの深さの見出しにするか。
   * `sizeLevel` は `[** ]` で 1、`[***** ]` で 4。null を返すと見出しにせず、太字の段落にする。
   * 1〜6 の外の値は、その範囲に収める。
   *
   * @defaultValue `[** ]` が 4、`[*** ]` が 3、`[**** ]` 以上が 2。1 はタイトルが使う
   */
  readonly headingDepth?: (sizeLevel: number) => number | null
}

interface ResolvedOptions {
  readonly pageUrl: (title: string, node: PageRefNode) => string
  readonly iconImageUrl: (node: IconNode) => string | null
  readonly headingDepth: (sizeLevel: number) => number | null
}

const defaultHeadingDepth = (sizeLevel: number): number => Math.max(2, 5 - sizeLevel)

const resolveOptions = (options: MdastOptions): ResolvedOptions => ({
  pageUrl: options.pageUrl ?? defaultPageUrl,
  iconImageUrl: options.iconImageUrl ?? (() => null),
  headingDepth: options.headingDepth ?? defaultHeadingDepth,
})

// ---------------------------------------------------------------------------
// インライン
// ---------------------------------------------------------------------------

const text = (value: string): Text => ({ type: "text", value })

const paragraph = (children: PhrasingContent[]): Paragraph => ({ type: "paragraph", children })

/** 空でなく、script が動くスキームでもない URL。 */
const usableUrl = (url: string | null | undefined, isSafe: (url: string) => string | null) =>
  pipe(
    Option.fromNullable(url),
    Option.flatMapNullable(isSafe),
    Option.filter((usable) => usable !== ""),
  )

/** 遷移先が使えるときだけリンクで包む。使えなければ中身だけを出し、文字は落とさない。 */
const linkedTo = (url: string | null | undefined, children: PhrasingContent[]): PhrasingContent[] =>
  Option.match(usableUrl(url, safeHref), {
    onNone: () => children,
    onSome: (href) => [{ type: "link", url: href, children }],
  })

const pageLink = (node: PageRefNode, label: PhrasingContent[], options: ResolvedOptions) =>
  linkedTo(options.pageUrl(pageTitleOf(node), node), label)

/**
 * 装飾を表すノードを、内側から外側の順に並べたもの。
 * 下線は Markdown に記法が無いので持たず、中身だけになる。
 */
const DECORATIONS: readonly (readonly [
  (node: Decoration) => boolean,
  (children: PhrasingContent[]) => PhrasingContent,
])[] = [
  [(node) => node.strike, (children) => ({ type: "delete", children })],
  [(node) => node.italic, (children) => ({ type: "emphasis", children })],
  [(node) => node.bold, (children) => ({ type: "strong", children })],
]

const decorated = (node: Decoration, options: ResolvedOptions): PhrasingContent[] =>
  DECORATIONS.filter(([isOn]) => isOn(node)).reduce<PhrasingContent[]>(
    (inner, [, wrap]) => [wrap(inner)],
    phrasingOfChildren(node, options),
  )

const icon = (node: IconNode, options: ResolvedOptions): PhrasingContent[] => {
  const label: PhrasingContent = Option.match(usableUrl(options.iconImageUrl(node), safeSrc), {
    onNone: () => text(node.user),
    onSome: (url) => ({ type: "image", url, alt: node.user }),
  })
  // 連打の数だけ並べる。ノードを共有しないよう、1 つずつ作る。
  return Array.from({ length: node.count }, () => pageLink(node, [{ ...label }], options)).flat()
}

/** 1 つのノードを、段落の中に置くもの (文字・リンク・強調など) にする。 */
const phrasingOf = (node: AnyNode, options: ResolvedOptions): PhrasingContent[] => {
  switch (node.type) {
    case "text":
      return [text(node.value)]
    case "internalLink":
    case "projectLink":
      return pageLink(node, [text(node.label)], options)
    case "hashtag":
      return pageLink(node, [text(`#${node.value}`)], options)
    case "externalLink":
      return linkedTo(node.target, [text(node.label)])
    case "inlineCode":
      return [{ type: "inlineCode", value: node.value }]
    case "formula":
      return [{ type: "inlineMath", value: node.value }]
    case "image":
      // Gyazo のページの URL のように、そのままでは画像にならない URL をここで直す (toHast と同じ)。
      return pipe(
        usableUrl(asImageSrc(node.src) ?? node.src, safeSrc),
        Option.match({
          onNone: () => [],
          onSome: (url) => linkedTo(node.link, [{ type: "image", url, alt: "" }]),
        }),
      )
    // Markdown には動画・音声・埋め込みの記法が無いので、書かれた URL へのリンクにする。
    case "video":
      return linkedTo(node.src, [text(node.src)])
    case "audio":
      return linkedTo(node.src, [text(node.label ?? node.src)])
    case "embed":
      return linkedTo(node.url, [text(node.url)])
    case "location":
      return linkedTo(asMapUrl(node), [text(node.label ?? `${node.latitude},${node.longitude}`)])
    case "icon":
      return icon(node, options)
    case "decoration":
      return decorated(node, options)
    case "page":
    case "title":
    case "line":
    case "codeBlock":
    case "codeLine":
    case "table":
    case "tableRow":
    case "tableCell":
      return phrasingOfChildren(node, options)
    default:
      node satisfies never
      // 拡張が足した独自のノードも、中身は落とさない。
      return phrasingOfChildren(node, options)
  }
}

const phrasingOfChildren = (node: AnyNode, options: ResolvedOptions): PhrasingContent[] =>
  childrenOf(node).flatMap((child) => phrasingOf(child, options))

// ---------------------------------------------------------------------------
// 行
// ---------------------------------------------------------------------------

/** 1 行 (またはコードブロックと表) を、前後の行とのまとめ方で分けたもの。 */
type Row =
  /** 段落を区切る */
  | { readonly _tag: "blank" }
  /** 前後の同じ種類の行と 1 つの段落 (`quote` なら引用) にまとまる */
  | { readonly _tag: "line"; readonly quote: boolean; readonly children: PhrasingContent[] }
  /** 前後とまとまらない (タイトル・見出し・コードブロック・表) */
  | { readonly _tag: "block"; readonly content: BlockContent[] }
  /** 箇条書きの項目。前後の項目と 1 つの箇条書きにまとまる */
  | { readonly _tag: "item"; readonly indent: number; readonly content: BlockContent[] }

const blank: Row = { _tag: "blank" }

/** 行の中身だけを置いた位置に出す。字下げした行は箇条書きの項目、そうでなければ前後とまとまらない塊。 */
const placed = (indent: number, content: BlockContent[]): Row =>
  indent > 0 ? { _tag: "item", indent, content } : { _tag: "block", content }

const headingDepthOf = (sizeLevel: number, options: ResolvedOptions) =>
  pipe(
    Option.fromNullable(options.headingDepth(sizeLevel)),
    Option.map((depth) => Math.min(6, Math.max(1, Math.round(depth))) as Heading["depth"]),
  )

/** 空白だけの文字を除くと、大きい文字の装飾 1 つだけでできている行。 */
const largeDecorationOf = (node: LineBlock): Option.Option<Decoration> =>
  pipe(
    Option.some(
      node.children.filter((child) => !(child.type === "text" && child.value.trim() === "")),
    ),
    Option.filter((children) => children.length === 1),
    Option.flatMapNullable(([child]) => child),
    Option.filter((child): child is Decoration => child.type === "decoration"),
    Option.filter((decoration) => decoration.sizeLevel > 0),
  )

/**
 * 行全体が大きい文字の装飾なら見出しにする。Cosense ではこれを見出しとして使うため。
 * 見出しは字下げの無い行だけで、箇条書きの中では太字のまま残す (Markdown の箇条書きに見出しは置けるが、目次が崩れる)。
 */
const headingOf = (node: LineBlock, options: ResolvedOptions): Option.Option<Heading> =>
  pipe(
    Option.liftPredicate(node, (line) => line.indent === 0 && !line.quote && !line.monospace),
    Option.flatMap(largeDecorationOf),
    Option.flatMap((decoration) =>
      Option.map(headingDepthOf(decoration.sizeLevel, options), (depth): Heading => ({
        type: "heading",
        depth,
        // 見出しはそれだけで太いので、太字は外す。
        children: decorated({ ...decoration, bold: false }, options),
      })),
    ),
  )

/** コマンドの行 (`$ ls`) は中の記法を読まないので、行の文字のままインラインコードにする。 */
const lineChildrenOf = (node: LineBlock, options: ResolvedOptions): PhrasingContent[] =>
  node.monospace
    ? [{ type: "inlineCode", value: node.children.map(toPlainText).join("") }]
    : phrasingOfChildren(node, options)

const lineRowOf = (node: LineBlock, options: ResolvedOptions): Row => {
  if (node.children.length === 0) return blank
  return Option.match(headingOf(node, options), {
    onSome: (heading) => ({ _tag: "block", content: [heading] }),
    onNone: () => {
      const children = lineChildrenOf(node, options)
      if (node.indent === 0) return { _tag: "line", quote: node.quote, children }
      const body = paragraph(children)
      return placed(node.indent, node.quote ? [{ type: "blockquote", children: [body] }] : [body])
    },
  })
}

/**
 * ファイル名から決めた言語名をフェンスに付け、ファイル名そのものは言語名と違うときだけ後ろに添える。
 * `code:python` のように言語名だけを書いたブロックで、同じ名前を 2 度出さないため。
 */
const codeRowOf = (node: CodeBlock): Row => {
  const lang = codeLanguageOf(node.filename)
  const meta = node.filename.toLowerCase() === lang ? null : node.filename
  const value = node.lines.map((line) => line.value).join("\n")
  return placed(node.indent, [{ type: "code", lang: lang === "" ? null : lang, meta, value }])
}

const tableCell = (children: PhrasingContent[]): TableCell => ({ type: "tableCell", children })

/**
 * Cosense の表にはヘッダの行が無いが、Markdown (GFM) の表は 1 行目をヘッダとして要るので、1 行目をそれに当てる。
 * 行ごとにセルの数が違ってもよいので、足りないセルを空で埋めて表の形を保つ。
 * 名前は表に置く場所が無いので、表の前の段落にする。
 */
const tableRowOf = (node: TableBlock, options: ResolvedOptions): Row => {
  const columns = Math.max(0, ...node.rows.map((row) => row.cells.length))
  const table: Table = {
    type: "table",
    align: Array.from({ length: columns }, () => null),
    children: node.rows.map((row) => ({
      type: "tableRow",
      children: Array.from({ length: columns }, (_, index) =>
        tableCell(
          pipe(
            Option.fromNullable(row.cells[index]),
            Option.match({
              onNone: () => [],
              onSome: (cell) => phrasingOfChildren(cell, options),
            }),
          ),
        ),
      ),
    })),
  }
  const name = node.name === "" ? [] : [paragraph([text(node.name)])]
  return placed(node.indent, [...name, ...(columns === 0 ? [] : [table])])
}

const rowOf = (node: TopLevelBlock, options: ResolvedOptions): Row => {
  switch (node.type) {
    case "title":
      return node.children.length === 0
        ? blank
        : {
            _tag: "block",
            content: [{ type: "heading", depth: 1, children: phrasingOfChildren(node, options) }],
          }
    case "line":
      return lineRowOf(node, options)
    case "codeBlock":
      return codeRowOf(node)
    case "table":
      return tableRowOf(node, options)
    default:
      node satisfies never
      // 拡張が足した独自のブロックも、中身は落とさない。
      return { _tag: "line", quote: false, children: phrasingOfChildren(node, options) }
  }
}

// ---------------------------------------------------------------------------
// 行をブロックにまとめる
// ---------------------------------------------------------------------------

/** 同じ値を持つ隣どうしの行が 1 つのブロックにまとまる。まとまらない行は null。 */
const joinKeyOf = (row: Row): string | null =>
  Match.value(row).pipe(
    Match.tag("line", (line) => (line.quote ? "quote" : "line")),
    Match.tag("item", () => "item"),
    Match.orElse(() => null),
  )

/** 続いている行を、まとまる単位ごとに分ける。 */
const runsOf = (rows: readonly Row[]): (readonly [Row, ...Row[]])[] =>
  rows.reduce<(readonly [Row, ...Row[]])[]>((runs, row) => {
    const last = runs[runs.length - 1]
    const key = joinKeyOf(row)
    return last !== undefined && key !== null && joinKeyOf(last[0]) === key
      ? [...runs.slice(0, -1), [...last, row]]
      : [...runs, [row]]
  }, [])

/** 行の区切りを改行として残して、行の中身を 1 つの段落につなぐ。 */
const joinedParagraph = (lines: readonly PhrasingContent[][]): Paragraph =>
  paragraph(
    lines.flatMap((children, index) => (index === 0 ? children : [{ type: "break" }, ...children])),
  )

interface Item {
  readonly depth: number
  readonly content: BlockContent[]
}

/**
 * 字下げを、箇条書きの入れ子の深さ (1 から) にする。
 * 開いている字下げを浅い順に持ち、それより浅いものの数を深さにする。
 * 字下げが 2 段以上深くなっても入れ子は 1 段ずつ深くなり、最初の行は常に 1 段目になる。
 */
const depthsOf = (indents: readonly number[]): readonly number[] =>
  indents.reduce<{ readonly open: readonly number[]; readonly depths: readonly number[] }>(
    ({ open, depths }, indent) => {
      const outer = open.filter((opened) => opened < indent)
      return { open: [...outer, indent], depths: [...depths, outer.length + 1] }
    },
    { open: [], depths: [] },
  ).depths

/** `depth` の項目ごとに、それより深い後ろの項目を従えた組に分ける。 */
const groupsAt = (items: readonly Item[], depth: number): (readonly [Item, ...Item[]])[] =>
  items.reduce<(readonly [Item, ...Item[]])[]>((groups, item) => {
    const last = groups[groups.length - 1]
    return last === undefined || item.depth === depth
      ? [...groups, [item]]
      : [...groups.slice(0, -1), [...last, item]]
  }, [])

const listOf = (items: readonly Item[], depth: number): List => ({
  type: "list",
  ordered: false,
  spread: false,
  children: groupsAt(items, depth).map(([head, ...deeper]): ListItem => ({
    type: "listItem",
    spread: false,
    children: [...head.content, ...(deeper.length === 0 ? [] : [listOf(deeper, depth + 1)])],
  })),
})

const contentOfRun = (run: readonly [Row, ...Row[]]): RootContent[] => {
  const lines = run.flatMap((row) => (row._tag === "line" ? [row.children] : []))
  const items = run.flatMap((row) => (row._tag === "item" ? [row] : []))
  return Match.value(run[0]).pipe(
    Match.tag("blank", (): RootContent[] => []),
    Match.tag("block", (row) => row.content),
    Match.tag("line", (row): RootContent[] =>
      row.quote
        ? [{ type: "blockquote", children: [joinedParagraph(lines)] }]
        : [joinedParagraph(lines)],
    ),
    Match.tag("item", () => {
      const depths = depthsOf(items.map((item) => item.indent))
      return [
        listOf(
          items.map((item, index) => ({ depth: depths[index] ?? 1, content: item.content })),
          1,
        ),
      ]
    }),
    Match.exhaustive,
  )
}

/** ページの直下に並ぶブロックとして読めるノード。それ以外は 1 つの段落の中身として読む。 */
const topLevelBlocksOf = (node: AnyNode): Option.Option<readonly TopLevelBlock[]> => {
  switch (node.type) {
    case "page":
      return Option.some(node.children)
    case "title":
    case "line":
    case "codeBlock":
    case "table":
      return Option.some([node])
    default:
      return Option.none()
  }
}

/**
 * ページ (または任意のノード) を mdast にする。
 *
 * タイトルは見出し 1 になる。Markdown に記法の無いもの (下線・動画・埋め込み・地図) は、
 * 中身の文字か、書かれた URL へのリンクにして、文字は落とさない。
 * `javascript:` のようなスキームの URL はリンクや画像にしない。
 */
export const toMdast = (node: AnyNode, options: MdastOptions = {}): Root => {
  const resolved = resolveOptions(options)
  const children = Option.match(topLevelBlocksOf(node), {
    onSome: (blocks) => runsOf(blocks.map((block) => rowOf(block, resolved))).flatMap(contentOfRun),
    onNone: (): RootContent[] => {
      const phrasing = phrasingOf(node, resolved)
      return phrasing.length === 0 ? [] : [paragraph(phrasing)]
    },
  })
  return { type: "root", children }
}
