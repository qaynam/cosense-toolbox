import { Option } from "effect"
import type { ElementContent, Root, RootContent } from "hast"
import { toHtml as hastToHtml } from "hast-util-to-html"

const HASH_KEY = "code"

const pipeBytes = async (
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")

const fromBase64Url = (encoded: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  )

/**
 * 記法を、URL の `#` 以降に置く `#code=…` にする。
 *
 * `#` 以降はサーバーに送られないので、書いた内容はリンクを開いた人のブラウザの中にだけ届く。
 * 縮めてから URL に入る文字 (base64url) にするので、長いページもリンクに収まる。
 */
export const sourceToHash = async (source: string): Promise<string> => {
  const compressed = await pipeBytes(
    new TextEncoder().encode(source),
    new CompressionStream("deflate-raw"),
  )
  return `#${HASH_KEY}=${toBase64Url(compressed)}`
}

/**
 * {@link sourceToHash} の逆。`#code=` が無いときや、途中で切れたリンクのように読み戻せないときは
 * `Option.none()` を返す。
 */
export const sourceFromHash = async (hash: string): Promise<Option.Option<string>> => {
  const encoded = new URLSearchParams(hash.replace(/^#/, "")).get(HASH_KEY)
  if (encoded === null) return Option.none()
  try {
    const bytes = await pipeBytes(fromBase64Url(encoded), new DecompressionStream("deflate-raw"))
    return Option.some(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    return Option.none()
  }
}

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "details",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

type Node = RootContent | ElementContent

const isBlock = (node: Node): boolean => node.type === "element" && BLOCK_TAGS.has(node.tagName)

const isBlank = (node: Node): boolean => node.type === "text" && node.value.trim() === ""

// toHtml と同じ設定で文字列にする。整形した HTML が、実際に出る HTML と違う書き方にならないように
const serialize = (node: Node): string =>
  hastToHtml(node, { allowDangerousHtml: true, characterReferences: { useNamedReferences: true } })

const formatChildren = (children: ReadonlyArray<Node>, depth: number): ReadonlyArray<string> =>
  children.filter((child) => !isBlank(child)).flatMap((child) => formatNode(child, depth))

const formatNode = (node: Node, depth: number): ReadonlyArray<string> => {
  const indent = "  ".repeat(depth)
  if (node.type !== "element" || !node.children.some(isBlock)) {
    return [indent + serialize(node.type === "text" ? { ...node, value: node.value.trim() } : node)]
  }
  const close = `</${node.tagName}>`
  const open = serialize({ ...node, children: [] }).slice(0, -close.length)
  return [indent + open, ...formatChildren(node.children, depth + 1), indent + close]
}

/**
 * hast を、読むための HTML にする。ブロックの子を持つ要素だけを、子ごとに字下げした行に分ける。
 * 文の中の要素 (`strong` や `a`) は改行を足すと表示が変わるので、1 行のまま残す。
 * `pre > code` も子が文の中の要素なので、中の改行と字下げはそのまま残る。
 */
export const formatHtml = (node: Root | ElementContent): string =>
  (node.type === "root" ? formatChildren(node.children, 0) : formatNode(node, 0)).join("\n")

export interface Selection {
  readonly start: number
  readonly end: number
}

/** `from` から `to` までを `insert` に置き換え、選択を `selection` にする編集。 */
export interface LineEdit {
  readonly from: number
  readonly to: number
  readonly insert: string
  readonly selection: Selection
}

const lineStartOf = (text: string, position: number): number =>
  position === 0 ? 0 : text.lastIndexOf("\n", position - 1) + 1

const lineEndOf = (text: string, position: number): number => {
  const newline = text.indexOf("\n", position)
  return newline === -1 ? text.length : newline
}

const isIndent = (char: string | undefined): boolean => char === " " || char === "\t"

// 選択が次の行の頭で終わるときは、その行に触れていないものとする (行を選んだときの選択はそうなるため)
const touchedLines = (text: string, selection: Selection) => {
  const from = lineStartOf(text, selection.start)
  const endsAtNextLineStart =
    selection.end > from && selection.end === lineStartOf(text, selection.end)
  const to = lineEndOf(text, endsAtNextLineStart ? selection.end - 1 : selection.end)
  const lines = text.slice(from, to).split("\n")
  const lineStarts = lines.map(
    (_, index) => from + lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0),
  )
  return { from, to, lines, lineStarts }
}

const indentTouchedLines = (text: string, selection: Selection): LineEdit => {
  const { from, to, lines, lineStarts } = touchedLines(text, selection)
  const shift = (position: number) => lineStarts.filter((start) => start <= position).length
  return {
    from,
    to,
    insert: lines.map((line) => ` ${line}`).join("\n"),
    selection: {
      start: selection.start + shift(selection.start),
      end: selection.end + shift(selection.end),
    },
  }
}

/**
 * 選択が触れている行を、Cosense Web の Tab / Shift+Tab と同じく 1 段ずつ字下げ・字上げする。
 * 1 段は行頭の空白 1 つで、字上げではタブも 1 段として取る。
 *
 * 選択が次の行の頭で終わるときは、その行に触れていないものとする。
 * 字上げで取れる空白が 1 つも無いときは `Option.none()` を返す。
 */
export const indentLines = (
  text: string,
  selection: Selection,
  direction: "indent" | "outdent",
): Option.Option<LineEdit> => {
  if (direction === "indent") return Option.some(indentTouchedLines(text, selection))

  const { from, to, lines, lineStarts } = touchedLines(text, selection)
  const removed = lineStarts.filter((start) => isIndent(text[start]))
  if (removed.length === 0) return Option.none()
  // 取った空白より後ろの位置だけを詰める。行頭にあるカーソルを、前の行へ押し出さないため
  const shift = (position: number) => removed.filter((start) => start < position).length
  return Option.some({
    from,
    to,
    insert: lines.map((line) => (isIndent(line[0]) ? line.slice(1) : line)).join("\n"),
    selection: {
      start: selection.start - shift(selection.start),
      end: selection.end - shift(selection.end),
    },
  })
}

/**
 * Tab を押したときの編集。カーソルが行の頭 (字下げの空白の中を含む) にあるときと、選択が行を
 * またぐときだけ、{@link indentLines} と同じく行を字下げする。それ以外は、選択をタブに置き換える。
 * 表のセルはタブで区切るので、行の途中のタブは表を書くのに使える。
 */
export const indentOrInsertTab = (text: string, selection: Selection): LineEdit => {
  const beforeSelection = text.slice(lineStartOf(text, selection.start), selection.start)
  const spansLines = text.slice(selection.start, selection.end).includes("\n")
  if (spansLines || [...beforeSelection].every(isIndent)) {
    return indentTouchedLines(text, selection)
  }
  const caret = selection.start + 1
  return {
    from: selection.start,
    to: selection.end,
    insert: "\t",
    selection: { start: caret, end: caret },
  }
}

/**
 * 選択を改行に置き換え、Cosense Web の Enter と同じく、新しい行を今の行と同じ深さで始める。
 * 字下げの途中で改行したときは、カーソルより前の字下げだけを引き継ぐ。
 */
export const breakLine = (text: string, selection: Selection): LineEdit => {
  const lineStart = lineStartOf(text, selection.start)
  const beforeCaret = text.slice(lineStart, selection.start)
  const indent = beforeCaret.slice(0, beforeCaret.length - beforeCaret.trimStart().length)
  const insert = `\n${indent}`
  const caret = selection.start + insert.length
  return {
    from: selection.start,
    to: selection.end,
    insert,
    selection: { start: caret, end: caret },
  }
}
