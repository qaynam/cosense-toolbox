/**
 * to-markdown.ts — AST を Markdown の文字列にする。
 *
 * `toMdast` で mdast にしてから文字列にするだけの近道。Markdown に移す規則は `toMdast` にしか持たない。
 * 打ち消し線と表は GFM、数式は remark-math と同じ `$...$` で書く。
 */
import { gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough"
import { gfmTableToMarkdown } from "mdast-util-gfm-table"
import { mathToMarkdown } from "mdast-util-math"
import { toMarkdown as mdastToMarkdown } from "mdast-util-to-markdown"

import type { AnyNode } from "../types"
import { type MdastOptions, toMdast } from "./to-mdast"

export type MarkdownOptions = MdastOptions

/**
 * ページ (または任意のノード) を Markdown の文字列にする。`mdast-util-to-markdown(toMdast(node, options))` と同じ。
 * Markdown の記号として読まれる文字はエスケープする。
 */
export const toMarkdown = (node: AnyNode, options: MarkdownOptions = {}): string =>
  mdastToMarkdown(toMdast(node, options), {
    bullet: "-",
    extensions: [gfmStrikethroughToMarkdown(), gfmTableToMarkdown(), mathToMarkdown()],
  })
