/**
 * `@cosense-toolbox/parser/markdown` — AST を Markdown 系の出力 (mdast と Markdown の文字列) にする。
 * パースはしない (この層はパーサー本体を import しない)。
 *
 * Markdown に移す規則は `toMdast` だけが持ち、`toMarkdown` はその出力を文字列にする。
 * Markdown が要る人だけが読み込む入口なので、mdast の部品は他の入口のバンドルに入らない。
 */
export { toMdast } from "./to-mdast"
export type { MdastOptions } from "./to-mdast"
export { toMarkdown } from "./to-markdown"
export type { MarkdownOptions } from "./to-markdown"
export type { PageRefNode } from "../core/page-ref"
