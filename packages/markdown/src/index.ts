/**
 * `@cosense-toolbox/markdown` — Markdown を Cosense のページとして読む。
 *
 * AST が欲しいなら `parseFromMarkdown`、Cosense に貼るテキストが欲しいなら `markdownToCosenseText`。
 * 記法の対応は `@cosense-toolbox/parser/markdown` の `fromMdast` が決める。
 */
export { markdownToCosenseText, parseFromMarkdown } from "./parse-from-markdown"
export type { MarkdownOptions } from "./parse-from-markdown"
