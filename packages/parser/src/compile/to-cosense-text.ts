/**
 * to-cosense-text.ts — AST を Cosense の記法のテキストに書き出す。
 *
 * `parse` の逆向き。書き換えた AST や、Markdown のような別の形式から作った AST を、
 * Cosense のページに貼れるテキストにする。
 *
 * 仕組みは `toHast` と同じで、ノード型ごとの既定のハンドラを `handlers` で置き換え、
 * できた出力を `extensions` が並べた順に加工する。
 *
 * AST は書きかたの違いを持たないので、同じ意味の記法は決まった 1 つの書きかたで出す
 * (`[[a]]` は `[* a]`、`[URL ラベル]` は `[ラベル URL]`、全角空白やタブの字下げは半角空白)。
 * 書かれたとおりの文字が欲しいときは、元のテキストから `rawTextOf` で切り出す。
 */
import { Option, pipe } from "effect"

import { childrenOf } from "../ast"
import type {
  AnyNode,
  AnyNodeType,
  Decoration,
  ImageNode,
  LocationNode,
  NodeOfType,
  VideoNode,
} from "../types"

/** ハンドラと拡張の中から再帰的に書き出すための入口。 */
export interface CosenseTextContext {
  /**
   * 今書き出しているノードの祖先。根 (`toCosenseText` に渡したノード) から親までの順に並ぶ。
   * 「表のセルの中の text だけ」のように、どこにあるかで出力を変えるときに使う。
   */
  readonly ancestors: readonly AnyNode[]
  /** ノード 1 つを書き出す (そのノード型のハンドラと拡張を通る) */
  readonly node: (node: AnyNode) => string
  /** 子ノードをそれぞれ書き出して、並べて返す。つなぎ方は呼ぶ側が決める */
  readonly children: (node: AnyNode) => string[]
}

export type CosenseTextHandler<K extends AnyNodeType> = (
  node: NodeOfType<K>,
  ctx: CosenseTextContext,
) => string

/**
 * ノード型 → ハンドラの対応。`AnyNodeMap` から型を導出しているので、
 * ノード型が増えたら (declaration merging を含む) ここも自動で新しいキーを受け入れる。
 */
export type CosenseTextHandlers = {
  readonly [K in AnyNodeType]?: CosenseTextHandler<K>
}

/**
 * 書き出しの拡張の 1 段。そのノード型の、ここまでの出力 (既定のハンドラか `handlers`、
 * 先に並べた拡張を通したもの) を受け取り、新しい出力を返す。
 * 出力を一から作るのは `handlers` の役目なので、拡張では作り直さない。
 */
export type CosenseTextTransform<K extends AnyNodeType> = (
  output: string,
  node: NodeOfType<K>,
  ctx: CosenseTextContext,
) => string

/** 書き出しの拡張。ノード型ごとに `CosenseTextTransform` を持つ。 */
export type CosenseTextExtension = {
  readonly [K in AnyNodeType]?: CosenseTextTransform<K>
}

export interface CosenseTextOptions {
  /**
   * ノード型ごとの出力の置き換え。指定した型だけが差し替わる。
   * 出力を一から作りたいときに使う。できた出力に手を加えるだけなら `extensions` を使う。
   */
  readonly handlers?: CosenseTextHandlers
  /**
   * 書き出しの拡張。`handlers` の後に、並べた順に出力を加工する。
   * 前の拡張の出力が次の拡張に渡るので、同じノード型に触る拡張どうしも重ねられる。
   */
  readonly extensions?: readonly CosenseTextExtension[]
}

const pad = (indent: number): string => " ".repeat(indent)

/** `*` は大きさの段階の数だけ重ねる (`[*** a]` は段階 2)。ほかの記号は 1 つずつ。 */
const markersOf = (node: Decoration): string =>
  node.markers.map((marker) => (marker === "*" ? "*".repeat(node.sizeLevel + 1) : marker)).join("")

const coordinateOf = (value: number, positive: string, negative: string): string =>
  value < 0 ? `${negative}${-value}` : `${positive}${value}`

const locationOf = (node: LocationNode): string =>
  [
    coordinateOf(node.latitude, "N", "S"),
    coordinateOf(node.longitude, "E", "W"),
    ...(node.zoom === undefined ? [] : [`Z${node.zoom}`]),
  ].join(",")

/** URL の前にラベルを置いた `[ラベル URL]`。ラベルが無いか URL と同じなら `[URL]`。 */
const labeled = (label: string | undefined, url: string): string =>
  label === undefined || label === "" || label === url ? `[${url}]` : `[${label} ${url}]`

/** 画像と動画。大きい表示は `[[URL]]`、リンク付きは `[リンク先 URL]`。 */
const mediaOf = (node: ImageNode | VideoNode): string =>
  node.large === true
    ? `[[${node.src}]]`
    : node.link === undefined
      ? `[${node.src}]`
      : `[${node.link} ${node.src}]`

/**
 * 既定のハンドラ一式。`toCosenseText` はこれに `handlers` を重ねてから走らせる。
 * 既定の出力に手を加えるだけなら、これを呼ばずに `extensions` を使う。
 */
export const defaultCosenseTextHandlers = {
  page: (node, ctx) => ctx.children(node).join("\n"),

  // タイトルは記法を読まないので、子ではなく書かれた文字を出す。
  title: (node) => node.value,

  line: (node, ctx) => `${pad(node.indent)}${node.quote ? "> " : ""}${ctx.children(node).join("")}`,

  codeBlock: (node, ctx) =>
    [
      `${pad(node.indent)}code:${node.filename}`,
      ...node.lines.map((codeLine) => `${pad(node.indent + 1)}${ctx.node(codeLine)}`),
    ].join("\n"),
  codeLine: (node) => node.value,

  table: (node, ctx) =>
    [
      `${pad(node.indent)}table:${node.name}`,
      ...node.rows.map((row) => `${pad(node.indent + 1)}${ctx.node(row)}`),
    ].join("\n"),
  tableRow: (node, ctx) => ctx.children(node).join("\t"),
  tableCell: (node, ctx) => ctx.children(node).join(""),

  text: (node) => node.value,
  internalLink: (node) => `[${node.target}]`,
  externalLink: (node) => labeled(node.label, node.target),
  projectLink: (node) => `[${node.target}]`,
  hashtag: (node) => `#${node.value}`,
  inlineCode: (node) => `\`${node.value}\``,
  formula: (node) => `[$ ${node.value}]`,
  icon: (node) => `[${node.user}.icon${node.count > 1 ? `*${node.count}` : ""}]`,
  image: (node) => mediaOf(node),
  video: (node) => mediaOf(node),
  audio: (node) => labeled(node.label, node.src),
  embed: (node) => `[${node.url}]`,
  location: (node) =>
    node.label === undefined ? `[${locationOf(node)}]` : `[${node.label} ${locationOf(node)}]`,
  decoration: (node, ctx) => `[${markersOf(node)} ${ctx.children(node).join("")}]`,
} satisfies CosenseTextHandlers

/**
 * ノード型で表 (ハンドラや拡張) を引く。
 * 表の関数の型はキーごとに違うが、ノードの `type` でキーを引いている以上一致するので、型はここ 1 か所で合わせる。
 */
const entryOf = <F>(table: object, type: AnyNodeType): Option.Option<F> =>
  Option.fromNullable((table as Readonly<Record<string, F | undefined>>)[type])

/**
 * ページ (または任意のノード) を Cosense の記法のテキストにする。
 *
 * 1 つのノードは「既定のハンドラ (`handlers` があれば置き換え)」で書き出し、`extensions` を並べた順に通す。
 * ハンドラの無いノード型 (記法の拡張が足した独自ノード) は、中身を落とさずに子を書き出してつなぐ。
 * Cosense の記法には逃がし (エスケープ) が無いので、text ノードの文字はそのまま出す。
 */
export const toCosenseText = (node: AnyNode, options: CosenseTextOptions = {}): string => {
  const handlers: CosenseTextHandlers = { ...defaultCosenseTextHandlers, ...options.handlers }
  const extensions = options.extensions ?? []

  const render = (target: AnyNode, ctx: CosenseTextContext): string =>
    pipe(
      entryOf<CosenseTextHandler<AnyNodeType>>(handlers, target.type),
      Option.match({
        onNone: () => ctx.children(target).join(""),
        onSome: (handler) => handler(target, ctx),
      }),
    )

  const extend = (target: AnyNode, output: string, ctx: CosenseTextContext): string =>
    extensions.reduce(
      (current, extension) =>
        pipe(
          entryOf<CosenseTextTransform<AnyNodeType>>(extension, target.type),
          Option.match({
            onNone: () => current,
            onSome: (transform) => transform(current, target, ctx),
          }),
        ),
      output,
    )

  const contextOf = (target: AnyNode, ancestors: readonly AnyNode[]): CosenseTextContext => {
    const inside = [...ancestors, target]
    return {
      ancestors,
      node: (child) => compile(child, inside),
      children: (parent) => childrenOf(parent).map((child) => compile(child, inside)),
    }
  }

  const compile = (target: AnyNode, ancestors: readonly AnyNode[]): string => {
    const ctx = contextOf(target, ancestors)
    return extend(target, render(target, ctx), ctx)
  }

  return compile(node, [])
}
