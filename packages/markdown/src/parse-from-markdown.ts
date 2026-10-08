/**
 * parse-from-markdown.ts — Markdown の文字列を、Cosense のページの AST と記法のテキストにする。
 *
 * Markdown を読む部品 (micromark) で mdast にし、`@cosense-toolbox/parser/markdown` の `fromMdast` で
 * Cosense の AST に、`toCosenseText` で記法のテキストにする。読み方は remark と同じ (CommonMark と GFM、数式)。
 */
import type { Page } from "@cosense-toolbox/parser"
import { type CosenseTextOptions, toCosenseText } from "@cosense-toolbox/parser/compile"
import { fromMdast } from "@cosense-toolbox/parser/markdown"
import type { Root } from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { mathFromMarkdown } from "mdast-util-math"
import { gfm } from "micromark-extension-gfm"
import { math as mathSyntax } from "micromark-extension-math"

import { toPandocDollarMath } from "./dollar-math"

export interface MarkdownOptions {
  /**
   * `$...$` と `$$...$$` を数式として読み、`[$ ]` にするか。既定は `true`。
   * 数式は CommonMark にも GFM にも無い拡張なので、`false` にすると `$` はすべて文字のまま残る。
   * `true` でも、`$5と$10` のような値段は pandoc と同じ決まりで数式にしない。
   */
  readonly math?: boolean | undefined
}

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

/**
 * Markdown を読んで、Cosense のページの AST にする。
 *
 * 先頭が `#` の見出しならページのタイトルになり、そうでなければタイトルは空になる。
 * ノードの `position` は、元になった Markdown のノードの位置を指す。
 */
export const parseFromMarkdown = (markdown: string, { math = true }: MarkdownOptions = {}): Page =>
  fromMdast(mdastOf(markdown, math))

/**
 * Markdown を読んで、Cosense のページに貼れる記法のテキストにする。1 行目はタイトル。
 * `handlers` と `extensions` は `toCosenseText` と同じで、書き出しを変えられる。
 */
export const markdownToCosenseText = (
  markdown: string,
  { math, ...options }: MarkdownOptions & CosenseTextOptions = {},
): string => toCosenseText(parseFromMarkdown(markdown, { math }), options)
