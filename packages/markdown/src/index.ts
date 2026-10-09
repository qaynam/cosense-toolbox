/**
 * `@cosense-toolbox/markdown` — Markdown を Cosense のページとして読む。
 *
 * Cosense に貼るテキストが欲しいなら `markdownToCosenseText`、AST が欲しいなら `parseFromMarkdown`。
 * remark などで作った mdast が手元にあるなら `fromMdast` に渡す。記法の対応は `fromMdast` が決める。
 */
export { fromMdast } from "./from-mdast"
export { markdownToCosenseText, parseFromMarkdown } from "./parse-from-markdown"
export type { MarkdownOptions } from "./parse-from-markdown"
