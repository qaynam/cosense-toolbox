/**
 * from-mdast.ts — mdast (Markdown の AST) を Cosense のページの AST にする。
 *
 * Markdown はブロック (段落・箇条書き) が単位で、Cosense は 1 行が単位なので、ブロックを行に開く。
 * 箇条書きの深さは字下げに、見出しは大きい文字の装飾に、コードのフェンスと表はコードブロックと表にする。
 * Cosense の記法のテキストにするには、できた AST を `toCosenseText` に渡す。
 *
 * Markdown の文字は Markdown のとおり文字のノードにする (`[ページ]` や `#tag` を Cosense のリンクとして読み直さない)。
 * ノードの `position` は、元になった Markdown のノードの位置を指す。
 */
import { Option, pipe } from "effect"
import type {
  Code,
  Delete,
  Emphasis,
  Heading,
  List,
  ListItem,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  TableCell as MdastTableCell,
} from "mdast"

import { toCosenseText } from "../compile/to-cosense-text"
import type {
  Decoration,
  InlineNode,
  LineBlock,
  Page,
  Point,
  Position,
  TableCell,
  TitleBlock,
  TopLevelBlock,
} from "../types"

interface Context {
  /** 参照の形のリンク (`[a][1]`) の行き先。`[1]: url` の定義から引く */
  readonly definitions: ReadonlyMap<string, string>
  /** 装飾の中にいる。Cosense の装飾は入れ子にできないので、中の装飾は外して中身だけにする */
  readonly inDecoration: boolean
}

// ---------------------------------------------------------------------------
// 位置
// ---------------------------------------------------------------------------

/** unist の位置は 1 始まりの行と列、Cosense の AST は 0 始まり。位置の無い mdast では先頭とみなす。 */
const pointOf = (
  point: { line: number; column: number; offset?: number | undefined } | undefined,
): Point => ({
  line: (point?.line ?? 1) - 1,
  column: (point?.column ?? 1) - 1,
  offset: point?.offset ?? 0,
})

const positionOf = (node: Nodes): Position => ({
  start: pointOf(node.position?.start),
  end: pointOf(node.position?.end),
})

/** Markdown に無いノード (空行や番号) は、隣のノードの始まりに幅 0 で置く。 */
const emptyAt = (position: Position): Position => ({ start: position.start, end: position.start })

// ---------------------------------------------------------------------------
// インライン
// ---------------------------------------------------------------------------

/** 行の区切り。段落の中の改行 (`\n` と行末の `\`) で、Cosense の行を分ける。 */
const BREAK = { type: "break" } as const
type Run = InlineNode | typeof BREAK

/** Cosense が URL として読むのは http(s) だけ。相対パスやページ内のアンカーはリンクにならない。 */
const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url)

/** mdast のノードの文字だけを、記号を外してつなぐ。 */
const textOf = (node: Nodes): string =>
  "value" in node && typeof node.value === "string"
    ? node.value
    : "children" in node
      ? node.children.map((child) => textOf(child)).join("")
      : node.type === "image" || node.type === "imageReference"
        ? (node.alt ?? "")
        : ""

const textNode = (value: string, position: Position): InlineNode => ({
  type: "text",
  value,
  position,
})

/** 段落の中の改行で、文字を行の区切りの前後に分ける。 */
const textRuns = (value: string, position: Position): Run[] =>
  value
    .split("\n")
    .flatMap((part, index) => [
      ...(index === 0 ? [] : [BREAK]),
      ...(part === "" ? [] : [textNode(part, position)]),
    ])

type DecorationNode = Strong | Emphasis | Delete

const DECORATION_MARKERS: Readonly<Record<DecorationNode["type"], string>> = {
  strong: "*",
  emphasis: "/",
  delete: "-",
}

const isDecoration = (node: PhrasingContent): node is DecorationNode =>
  node.type === "strong" || node.type === "emphasis" || node.type === "delete"

interface Decorated {
  readonly markers: readonly string[]
  readonly children: readonly PhrasingContent[]
}

/**
 * ちょうど重なった装飾 (`**_a_**`) を、記号をまとめた 1 つの装飾にする。
 * Cosense では `[-/ a]` (打ち消し かつ 斜体) のように、1 つの記法が複数の装飾を持てるため。
 */
const decoratedOf = (node: DecorationNode): Decorated => {
  const marker = DECORATION_MARKERS[node.type]
  return pipe(
    Option.liftPredicate(node.children, (children) => children.length === 1),
    Option.flatMapNullable(([only]) => only),
    Option.filter(isDecoration),
    Option.match({
      onNone: (): Decorated => ({ markers: [marker], children: node.children }),
      onSome: (inner) => {
        const nested = decoratedOf(inner)
        return { markers: [marker, ...nested.markers], children: nested.children }
      },
    }),
  )
}

/** 装飾の中には行の区切りを置けないので、区切りは空白にする。 */
const inOneLine = (runs: readonly Run[], position: Position): InlineNode[] =>
  runs.map((run) => (run.type === "break" ? textNode(" ", position) : run))

const decorationNode = (
  markers: readonly string[],
  sizeLevel: number,
  children: readonly InlineNode[],
  position: Position,
): Decoration => ({
  type: "decoration",
  value: children.map((child) => toCosenseText(child)).join(""),
  markers,
  bold: markers.includes("*"),
  italic: markers.includes("/"),
  strike: markers.includes("-"),
  underline: false,
  sizeLevel,
  children,
  position,
})

const decorationRuns = (node: DecorationNode, ctx: Context): Run[] => {
  if (ctx.inDecoration) return runsOf(node.children, ctx)
  const { markers, children } = decoratedOf(node)
  const position = positionOf(node)
  const inner = inOneLine(runsOf(children, { ...ctx, inDecoration: true }), position)
  return [decorationNode([...new Set(markers)], 0, inner, position)]
}

/** リンク先がある記法を Cosense の外部リンクにする。リンクにできなければ中身だけにする。 */
const linkRuns = (
  url: string | undefined,
  node: Extract<PhrasingContent, { type: "link" | "linkReference" }>,
  ctx: Context,
): Run[] => {
  if (url === undefined || !isWebUrl(url)) return runsOf(node.children, ctx)
  const position = positionOf(node)
  // リンク付きの画像は、Cosense では画像のノードがリンク先を持つ。
  return pipe(
    Option.liftPredicate(node.children, (children) => children.length === 1),
    Option.flatMapNullable(([only]) => only),
    Option.filter((only) => only.type === "image" && isWebUrl(only.url)),
    Option.match({
      onSome: (only): Run[] => [
        { type: "image", src: only.type === "image" ? only.url : "", link: url, position },
      ],
      onNone: (): Run[] => [
        {
          type: "externalLink",
          label: textOf(node).replace(/\s+/g, " ").trim() || url,
          target: url,
          position,
        },
      ],
    }),
  )
}

const imageRuns = (url: string | undefined, alt: string, position: Position): Run[] =>
  url !== undefined && isWebUrl(url)
    ? [{ type: "image", src: url, position }]
    : alt === ""
      ? []
      : [textNode(alt, position)]

/** 数式は CommonMark にも GFM にも無い拡張 (`mdast-util-math`) なので、型ではなく形で見分ける。 */
const mathValueOf = (node: { type: string }, type: string): Option.Option<string> =>
  node.type === type && "value" in node && typeof node.value === "string"
    ? Option.some(node.value)
    : Option.none()

const phrasingRuns = (node: PhrasingContent, ctx: Context): Run[] => {
  const position = positionOf(node)
  switch (node.type) {
    case "text":
    case "html":
      return textRuns(node.value, position)
    case "strong":
    case "emphasis":
    case "delete":
      return decorationRuns(node, ctx)
    case "inlineCode":
      return [{ type: "inlineCode", value: node.value, position }]
    case "break":
      return [BREAK]
    case "link":
      return linkRuns(node.url, node, ctx)
    case "linkReference":
      return linkRuns(ctx.definitions.get(node.identifier), node, ctx)
    case "image":
      return imageRuns(node.url, node.alt ?? "", position)
    case "imageReference":
      return imageRuns(ctx.definitions.get(node.identifier), node.alt ?? "", position)
    case "footnoteReference":
      return [textNode(`^${node.label ?? node.identifier}`, position)]
    default:
      return pipe(
        mathValueOf(node, "inlineMath"),
        Option.match({
          onSome: (value): Run[] => [{ type: "formula", value, position }],
          // 拡張が足したノードも、文字は落とさない。
          onNone: () => textRuns(textOf(node), position),
        }),
      )
  }
}

const runsOf = (nodes: readonly PhrasingContent[], ctx: Context): Run[] =>
  nodes.flatMap((node) => phrasingRuns(node, ctx))

/** 行の区切りで、インラインの並びを行ごとに分ける。 */
const splitLines = (runs: readonly Run[]): InlineNode[][] =>
  runs.reduce<InlineNode[][]>(
    (lines, run) =>
      run.type === "break"
        ? [...lines, []]
        : [...lines.slice(0, -1), [...(lines[lines.length - 1] ?? []), run]],
    [[]],
  )

// ---------------------------------------------------------------------------
// ブロック
// ---------------------------------------------------------------------------

const lineOf = (
  indent: number,
  children: readonly InlineNode[],
  position: Position,
): LineBlock => ({
  type: "line",
  indent,
  quote: false,
  monospace: false,
  children,
  position,
})

/** `#` が 1 つの見出しが `[***** ]` (段階 4) で、深くなるほど段階が下がり、`#####` 以降は太字。 */
const headingLines = (node: Heading, indent: number, ctx: Context): TopLevelBlock[] => {
  const position = positionOf(node)
  const children = inOneLine(runsOf(node.children, { ...ctx, inDecoration: true }), position)
  return [
    lineOf(
      indent,
      children.length === 0
        ? []
        : [decorationNode(["*"], Math.max(0, 5 - node.depth), children, position)],
      position,
    ),
  ]
}

/**
 * フェンスの言語名の後ろにファイル名 (`a.js`) があればそれを、無ければ言語名をコードブロックの名前にする。
 * Cosense の `code:` は名前を要るので、どちらも無ければ `text` にする。
 */
const codeNameOf = (node: Code): string =>
  pipe(
    Option.fromNullable(node.meta?.trim().split(/\s+/)[0]),
    Option.filter((token) => /^[\w.-]+\.\w+$/.test(token)),
    Option.orElse(() => Option.fromNullable(node.lang)),
    Option.getOrElse(() => "text"),
  )

const codeBlocks = (node: Code, indent: number): TopLevelBlock[] => {
  const position = positionOf(node)
  return [
    {
      type: "codeBlock",
      filename: codeNameOf(node),
      indent,
      lines: node.value.split("\n").map((value) => ({ type: "codeLine", value, position })),
      position,
    },
  ]
}

/** セルの中には行の区切りもタブも置けないので、空白にする。 */
const tableCellOf = (cell: MdastTableCell, ctx: Context): TableCell => {
  const position = positionOf(cell)
  const children = inOneLine(runsOf(cell.children, ctx), position).map((child) =>
    child.type === "text" ? { ...child, value: child.value.replace(/\t/g, " ") } : child,
  )
  return {
    type: "tableCell",
    value: children.map((child) => toCosenseText(child)).join(""),
    children,
    position,
  }
}

const tableBlocks = (node: Table, indent: number, ctx: Context): TopLevelBlock[] => [
  {
    type: "table",
    name: "table",
    indent,
    rows: node.children.map((row) => ({
      type: "tableRow",
      cells: row.children.map((cell) => tableCellOf(cell, ctx)),
      position: positionOf(row),
    })),
    position: positionOf(node),
  },
]

const itemPrefixOf = (list: List, item: ListItem, index: number): string => {
  const number = list.ordered === true ? `${(list.start ?? 1) + index}. ` : ""
  const check = item.checked === true ? "☑ " : item.checked === false ? "☐ " : ""
  return `${number}${check}`
}

/**
 * 項目の中身を行にし、1 行目の頭に番号やチェックの印を付ける。
 * 先頭が通常の行でない (コードブロックなど) ときは、印だけの行を前に置く。`code:` の前に文字を付けられないため。
 */
const itemLines = (
  item: ListItem,
  prefix: string,
  indent: number,
  ctx: Context,
): TopLevelBlock[] => {
  const blocks = blockLinesOf(item.children, indent, ctx, false)
  const [first, ...rest] = blocks
  if (prefix === "") return blocks
  const at = emptyAt(positionOf(item))
  return first?.type === "line"
    ? [{ ...first, children: [textNode(prefix, at), ...first.children] }, ...rest]
    : [lineOf(indent, [textNode(prefix.trimEnd(), at)], at), ...blocks]
}

const listLines = (node: List, indent: number, ctx: Context): TopLevelBlock[] =>
  node.children.flatMap((item, index) =>
    itemLines(item, itemPrefixOf(node, item, index), indent + 1, ctx),
  )

/** 引用の中の行に `>` を付ける。コードブロックと表は Cosense では引用にできないので、そのまま置く。 */
const quoted = (blocks: readonly TopLevelBlock[]): TopLevelBlock[] =>
  blocks.map((block) => (block.type === "line" ? { ...block, quote: true } : block))

const paragraphLines = (
  children: readonly PhrasingContent[],
  position: Position,
  indent: number,
  ctx: Context,
): TopLevelBlock[] =>
  splitLines(runsOf(children, ctx)).map((line) => lineOf(indent, line, position))

/** 1 つのブロックを、字下げ `indent` の行にする。行を持たないブロック (区切り線や定義) は空。 */
const linesOf = (node: RootContent, indent: number, ctx: Context): TopLevelBlock[] => {
  const position = positionOf(node)
  switch (node.type) {
    case "paragraph":
      return paragraphLines(node.children, position, indent, ctx)
    case "heading":
      return headingLines(node, indent, ctx)
    case "list":
      return listLines(node, indent, ctx)
    case "code":
      return codeBlocks(node, indent)
    case "blockquote":
      return quoted(blockLinesOf(node.children, indent, ctx, true))
    case "table":
      return tableBlocks(node, indent, ctx)
    case "html":
      return splitLines(textRuns(node.value, position)).map((line) =>
        lineOf(indent, line, position),
      )
    case "footnoteDefinition": {
      const [first, ...rest] = blockLinesOf(node.children, indent, ctx, false)
      const label = textNode(`^${node.label ?? node.identifier}: `, emptyAt(position))
      return first?.type === "line"
        ? [{ ...first, children: [label, ...first.children] }, ...rest]
        : [...(first === undefined ? [] : [first]), ...rest]
    }
    case "thematicBreak":
    case "definition":
      return []
    default:
      return pipe(
        mathValueOf(node, "math"),
        Option.match({
          onSome: (value) => [
            lineOf(
              indent,
              [
                {
                  type: "formula",
                  value: value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .join(" "),
                  position,
                },
              ],
              position,
            ),
          ],
          // 拡張が足したブロックも、文字は落とさない。
          onNone: () =>
            textOf(node)
              .split("\n")
              .filter((line) => line !== "")
              .map((line) => lineOf(indent, [textNode(line, position)], position)),
        }),
      )
  }
}

/**
 * Cosense のコードブロックと表は、後ろに続くより深い字下げの行を自分の中身として読む。
 * そのすぐ後に箇条書きを置くと、項目がコードや表の行になってしまうので、空行で区切る (空行でブロックが終わる)。
 */
const swallowsDeeperLines = (node: RootContent): boolean =>
  node.type === "code" || node.type === "table"

/**
 * 前後のブロックの間に空行を挟むか。`separate` は段落どうしのように区切りたいところ (箇条書きの項目の中以外)。
 * 見出しの後と、箇条書きの前は挟まない。Cosense では見出しのすぐ下に本文を書き、
 * 箇条書きを前の行の続きとして字下げで書くため。
 */
const separatedBy = (previous: RootContent, next: RootContent, separate: boolean): boolean =>
  (swallowsDeeperLines(previous) && next.type === "list") ||
  (separate && previous.type !== "heading" && next.type !== "list")

/** ブロックを順に行にする。`separate` のときは、ブロックの間に空行を挟む (箇条書きの項目の中では挟まない)。 */
const blockLinesOf = (
  blocks: readonly RootContent[],
  indent: number,
  ctx: Context,
  separate: boolean,
): TopLevelBlock[] =>
  blocks.reduce<{ readonly lines: TopLevelBlock[]; readonly previous: RootContent | null }>(
    ({ lines, previous }, block) => {
      const own = linesOf(block, indent, ctx)
      if (own.length === 0) return { lines, previous }
      const gap =
        previous !== null && separatedBy(previous, block, separate)
          ? [lineOf(0, [], emptyAt(positionOf(block)))]
          : []
      return { lines: [...lines, ...gap, ...own], previous: block }
    },
    { lines: [], previous: null },
  ).lines

/** 木の中のリンクの定義 (`[1]: url`) を集める。定義は参照より後ろにも書けるので、先に全体から集める。 */
const definitionsOf = (node: Nodes): [string, string][] =>
  node.type === "definition"
    ? [[node.identifier, node.url]]
    : "children" in node
      ? node.children.flatMap((child) => definitionsOf(child))
      : []

const titleOf = (heading: Option.Option<Heading>): TitleBlock =>
  Option.match(heading, {
    onNone: (): TitleBlock => ({
      type: "title",
      value: "",
      children: [],
      position: emptyAt({ start: pointOf(undefined), end: pointOf(undefined) }),
    }),
    onSome: (node): TitleBlock => {
      const value = textOf(node).replace(/\s+/g, " ").trim()
      const position = positionOf(node)
      return {
        type: "title",
        value,
        children: value === "" ? [] : [textNode(value, position)],
        position,
      }
    },
  })

/**
 * mdast を Cosense のページの AST にする。
 *
 * 先頭が `#` の見出しならページのタイトルになり、そうでなければタイトルは空になる。
 * Cosense のタイトルは記法を読まないので、見出しの文字だけを使う。
 * ノードの `position` は、元になった Markdown のノードの位置を指す。1 つの Markdown のノードから
 * 複数のノードを作ったとき (段落の中の改行で分けた行など) は、どれも同じ位置を持つ。
 * 空行や箇条書きの番号のように Markdown に無いノードは、隣のノードの始まりに幅 0 で置く。
 */
export const fromMdast = (root: Root): Page => {
  const ctx: Context = { definitions: new Map(definitionsOf(root)), inDecoration: false }
  const [first, ...rest] = root.children
  const heading = pipe(
    Option.fromNullable(first),
    Option.filter((node): node is Heading => node.type === "heading" && node.depth === 1),
  )
  const body = blockLinesOf(Option.isSome(heading) ? rest : root.children, 0, ctx, true)
  return {
    type: "page",
    children: [titleOf(heading), ...body],
    position: positionOf(root),
  }
}
