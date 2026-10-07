/**
 * `@cosense-toolbox/parser/from-markdown` — Markdown を読んで、Cosense の AST にする。
 *
 * Markdown を読む部品 (micromark) は大きいので、`parse` や `./markdown` (AST を Markdown にする) とは入口を分けている。
 * 使わない人のバンドルには入らない。
 */
export { parseFromMarkdown } from "./parse-from-markdown"
