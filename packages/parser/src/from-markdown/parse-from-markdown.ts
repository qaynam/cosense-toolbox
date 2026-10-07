/**
 * parse-from-markdown.ts — Markdown を読んで、Cosense の AST にする。
 *
 * Markdown を mdast にしてから Cosense の記法のテキストに書き直し、それを `parse` で読む。
 * mdast から Cosense の AST を直に組み立てないのは、できる AST が「そのテキストを Cosense に貼ったとき」と
 * 必ず同じになるようにするため。AST が書かれた文字列を保つ約束 (`position` や `rawTextOf`) も、そのテキストについて成り立つ。
 */
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { mathFromMarkdown } from "mdast-util-math"
import { gfm } from "micromark-extension-gfm"
import { math } from "micromark-extension-math"

import { parse, type ParseOptions } from "../parse"
import type { Page } from "../types"
import { toCosenseText } from "./to-cosense-text"

/** Markdown (GFM と `$...$` の数式) を、Cosense の記法のテキストに書き直す。1 行目はタイトル。 */
export const markdownToCosenseText = (markdown: string): string =>
  toCosenseText(
    fromMarkdown(markdown, {
      extensions: [gfm(), math()],
      mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
    }),
  )

/**
 * Markdown (GFM と `$...$` の数式) を読んで、Cosense のページの AST にする。
 *
 * 先頭が `#` の見出しならページのタイトルになり、そうでなければタイトルは空になる。
 * `position` は、Markdown を Cosense の記法に書き直したテキストの中の位置を指す。
 * `options` は `parse` と同じで、記法の拡張をそのまま渡せる。
 */
export const parseFromMarkdown = (markdown: string, options?: ParseOptions): Page =>
  parse(markdownToCosenseText(markdown), options)
