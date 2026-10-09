/**
 * to-cosense-text.ts — mdast (Markdown の AST) を Cosense の記法のテキストにする。
 *
 * Markdown はブロック (段落・箇条書き) が単位で、Cosense は 1 行が単位なので、ブロックを行に開く。
 * 箇条書きの深さは字下げに、見出しは大きい文字の装飾に、コードのフェンスと表は `code:` と `table:` の行にする。
 *
 * Cosense の記法には逃がし (エスケープ) が無いので、Markdown の文字に `[` や `#` があれば、
 * Cosense ではリンクやタグとして読まれる。Cosense のページに貼ったときと同じ結果になるよう、そのままにしている。
 */
import { Option, pipe } from "effect"
import type {
  Code,
  Delete,
  Emphasis,
  Heading,
  Link,
  List,
  ListItem,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
} from "mdast"
import type {} from "mdast-util-math"
import { toString } from "mdast-util-to-string"

interface Context {
  /** 参照の形のリンク (`[a][1]`) の行き先。`[1]: url` の定義から引く */
  readonly definitions: ReadonlyMap<string, string>
  /** 装飾の中にいる。Cosense の装飾は入れ子にできないので、中の装飾は記号を外す */
  readonly inDecoration: boolean
}

const pad = (indent: number): string => " ".repeat(indent)

/** Cosense が URL として読むのは http(s) だけ。相対パスやページ内のアンカーはリンクにならない。 */
const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url)

// ---------------------------------------------------------------------------
// インライン
// ---------------------------------------------------------------------------

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

const decoration = (node: DecorationNode, ctx: Context): string => {
  if (ctx.inDecoration) return inlineOf(node.children, ctx)
  const { markers, children } = decoratedOf(node)
  const content = inlineOf(children, { ...ctx, inDecoration: true })
  return content.trim() === "" ? content : `[${[...new Set(markers)].join("")} ${content}]`
}

/** リンク先がある記法を Cosense の外部リンクにする。リンクにできなければ文字だけを出す。 */
const linkTo = (
  url: string | undefined,
  node: Link | { children: PhrasingContent[] },
  ctx: Context,
) => {
  if (url === undefined || !isWebUrl(url)) return inlineOf(node.children, ctx)
  // リンク付きの画像は、Cosense では `[リンク先 画像]` と書く。
  const image = pipe(
    Option.liftPredicate(node.children, (children) => children.length === 1),
    Option.flatMapNullable(([only]) => only),
    Option.filter((only) => only.type === "image" && isWebUrl(only.url)),
    Option.map((only) => (only.type === "image" ? only.url : "")),
  )
  return Option.match(image, {
    onSome: (src) => `[${url} ${src}]`,
    onNone: () => {
      // ラベルの中に括弧の記法は置けないので、装飾などは外した文字にする。
      const label = toString(node).replace(/\s+/g, " ").trim()
      return label === "" || label === url ? `[${url}]` : `[${label} ${url}]`
    },
  })
}

const phrasingOf = (node: PhrasingContent, ctx: Context): string => {
  switch (node.type) {
    case "text":
      return node.value
    case "strong":
    case "emphasis":
    case "delete":
      return decoration(node, ctx)
    case "inlineCode":
      return `\`${node.value}\``
    case "inlineMath":
      return `[$ ${node.value}]`
    case "break":
      return "\n"
    case "link":
      return linkTo(node.url, node, ctx)
    case "linkReference":
      return linkTo(ctx.definitions.get(node.identifier), node, ctx)
    case "image":
      return isWebUrl(node.url) ? `[${node.url}]` : (node.alt ?? "")
    case "imageReference":
      return pipe(
        Option.fromNullable(ctx.definitions.get(node.identifier)),
        Option.filter(isWebUrl),
        Option.match({ onNone: () => node.alt ?? "", onSome: (url) => `[${url}]` }),
      )
    case "footnoteReference":
      return `^${node.label ?? node.identifier}`
    case "html":
      return node.value
    default:
      // 拡張が足したノードも、文字は落とさない。
      return toString(node)
  }
}

const inlineOf = (nodes: readonly PhrasingContent[], ctx: Context): string =>
  nodes.map((node) => phrasingOf(node, ctx)).join("")

// ---------------------------------------------------------------------------
// ブロック
// ---------------------------------------------------------------------------

/** 行の字下げの後ろに `> ` を入れて、引用の行にする。 */
const quoted = (indent: number, lines: readonly string[]): string[] =>
  lines.map((line) => `${pad(indent)}> ${line.slice(indent)}`.trimEnd())

/** `#` が 1 つの見出しが `[***** ]` で、深くなるほど `*` が減る。 */
const headingLines = (node: Heading, indent: number, ctx: Context): string[] => {
  const content = inlineOf(node.children, { ...ctx, inDecoration: true }).replace(/\n/g, " ")
  if (content.trim() === "") return []
  return [`${pad(indent)}[${"*".repeat(Math.max(1, 6 - node.depth))} ${content}]`]
}

/**
 * フェンスの言語名の後ろにファイル名 (`a.js`) があればそれを、無ければ言語名を `code:` に書く。
 * Cosense の `code:` は名前を要るので、どちらも無ければ `text` にする。
 */
const codeNameOf = (node: Code): string =>
  pipe(
    Option.fromNullable(node.meta?.trim().split(/\s+/)[0]),
    Option.filter((token) => /^[\w.-]+\.\w+$/.test(token)),
    Option.orElse(() => Option.fromNullable(node.lang)),
    Option.getOrElse(() => "text"),
  )

/** 本体はヘッダより 1 段深くする。中の空行も字下げを持たないと、そこでブロックが終わってしまう。 */
const codeLines = (node: Code, indent: number): string[] => [
  `${pad(indent)}code:${codeNameOf(node)}`,
  ...node.value.split("\n").map((line) => `${pad(indent + 1)}${line}`),
]

/** Cosense の表は名前を要るが、Markdown の表には無いので `table` とする。セルの中のタブと改行は区切りと紛れるので空白にする。 */
const tableLines = (node: Table, indent: number, ctx: Context): string[] => [
  `${pad(indent)}table:table`,
  ...node.children.map(
    (row) =>
      pad(indent + 1) +
      row.children.map((cell) => inlineOf(cell.children, ctx).replace(/[\t\n]/g, " ")).join("\t"),
  ),
]

/** 番号付きの箇条書きの番号と、タスクの印。Cosense に記法が無いので文字として残す。 */
const itemPrefixOf = (list: List, item: ListItem, index: number): string => {
  const number = list.ordered === true ? `${(list.start ?? 1) + index}. ` : ""
  const check = item.checked === true ? "☑ " : item.checked === false ? "☐ " : ""
  return number + check
}

/**
 * 項目の中身を、項目の深さに並べる。先頭の行に番号や印を付ける。
 * 先頭が段落でない (コードブロックなど) ときは、印だけの行を前に置く。`code:` の前に文字を付けられないため。
 */
const itemLines = (item: ListItem, prefix: string, indent: number, ctx: Context): string[] => {
  const lines = blockLinesOf(item.children, indent, ctx, false)
  if (prefix === "") return lines
  const [first, ...rest] = lines
  return first === undefined || item.children[0]?.type !== "paragraph"
    ? [`${pad(indent)}${prefix.trimEnd()}`, ...lines]
    : [`${pad(indent)}${prefix}${first.slice(indent)}`, ...rest]
}

const listLines = (node: List, indent: number, ctx: Context): string[] =>
  node.children.flatMap((item, index) =>
    itemLines(item, itemPrefixOf(node, item, index), indent + 1, ctx),
  )

/** 1 つのブロックを、字下げ `indent` の行にする。行を持たないブロック (区切り線や定義) は空。 */
const linesOf = (node: RootContent, indent: number, ctx: Context): string[] => {
  switch (node.type) {
    case "paragraph":
      return inlineOf(node.children, ctx)
        .split("\n")
        .map((line) => pad(indent) + line)
    case "heading":
      return headingLines(node, indent, ctx)
    case "list":
      return listLines(node, indent, ctx)
    case "code":
      return codeLines(node, indent)
    case "blockquote":
      return quoted(indent, blockLinesOf(node.children, indent, ctx, true))
    case "table":
      return tableLines(node, indent, ctx)
    case "math":
      return [
        `${pad(indent)}[$ ${node.value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ")}]`,
      ]
    case "html":
      return node.value.split("\n").map((line) => pad(indent) + line)
    case "footnoteDefinition": {
      const [first, ...rest] = blockLinesOf(node.children, indent, ctx, false)
      return first === undefined
        ? []
        : [`${pad(indent)}^${node.label ?? node.identifier}: ${first.slice(indent)}`, ...rest]
    }
    case "thematicBreak":
    case "definition":
      return []
    default:
      return toString(node)
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => pad(indent) + line)
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
): string[] =>
  blocks.reduce<{ readonly lines: string[]; readonly previous: RootContent | null }>(
    ({ lines, previous }, block) => {
      const own = linesOf(block, indent, ctx)
      if (own.length === 0) return { lines, previous }
      const gap = previous !== null && separatedBy(previous, block, separate) ? [""] : []
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

/**
 * Markdown の木を Cosense のページのテキストにする。1 行目はタイトル。
 * 先頭が `#` の見出しならそれをタイトルにし (Markdown に書き出すとタイトルが `#` になるのと対になる)、
 * そうでなければタイトルは空にする。Cosense のタイトルは記法を読まないので、見出しの文字だけを使う。
 */
export const toCosenseText = (root: Root): string => {
  const ctx: Context = { definitions: new Map(definitionsOf(root)), inDecoration: false }
  const [first, ...rest] = root.children
  const titled = first?.type === "heading" && first.depth === 1
  const title = titled ? toString(first).replace(/\s+/g, " ").trim() : ""
  const body = blockLinesOf(titled ? rest : root.children, 0, ctx, true)
  return [title, ...body].join("\n")
}
