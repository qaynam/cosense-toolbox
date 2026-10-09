/**
 * parse-from-markdown.ts — Markdown を読んで、Cosense の AST にする。
 *
 * Markdown を mdast にしてから Cosense の記法のテキストに書き直し、それを `parse` で読む。
 * mdast から Cosense の AST を直に組み立てないのは、できる AST が「そのテキストを Cosense に貼ったとき」と
 * 必ず同じになるようにするため。AST が書かれた文字列を保つ約束 (`position` や `rawTextOf`) も、そのテキストについて成り立つ。
 */
import type { Root } from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { mathFromMarkdown } from "mdast-util-math"
import { gfm } from "micromark-extension-gfm"
import { math as mathSyntax } from "micromark-extension-math"

import { parse, type ParseOptions } from "../parse"
import type { Page } from "../types"
import { toPandocDollarMath } from "./dollar-math"
import { toCosenseText } from "./to-cosense-text"

export interface MarkdownOptions {
  /**
   * `$...$` と `$$...$$` を数式として読み、`[$ ]` にするか。既定は `true`。
   * 数式は CommonMark にも GFM にも無い拡張なので、`false` にすると `$` はすべて文字のまま残る。
   * `true` でも、`$5と$10` のような値段は pandoc と同じ決まりで数式にしない。
   */
  readonly math?: boolean | undefined
}

export interface ParseFromMarkdownOptions extends ParseOptions, MarkdownOptions {}

const mdastOf = (markdown: string, math: boolean): Root =>
  math
    ? toPandocDollarMath(
        fromMarkdown(markdown, {
          extensions: [gfm(), mathSyntax()],
          mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
        }),
        markdown,
      )
    : fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })

/** Markdown (GFM と `$...$` の数式) を、Cosense の記法のテキストに書き直す。1 行目はタイトル。 */
export const markdownToCosenseText = (
  markdown: string,
  { math = true }: MarkdownOptions = {},
): string => toCosenseText(mdastOf(markdown, math))

/**
 * Markdown (GFM と `$...$` の数式) を読んで、Cosense のページの AST にする。
 *
 * 先頭が `#` の見出しならページのタイトルになり、そうでなければタイトルは空になる。
 * `position` は、Markdown を Cosense の記法に書き直したテキストの中の位置を指す。
 * `math` のほかは `parse` と同じオプションで、記法の拡張をそのまま渡せる。
 */
export const parseFromMarkdown = (
  markdown: string,
  { math, ...options }: ParseFromMarkdownOptions = {},
): Page => parse(markdownToCosenseText(markdown, { math }), options)
