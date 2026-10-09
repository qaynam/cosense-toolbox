/**
 * `@cosense-toolbox/markdown` — Markdown を Cosense のページとして読む。
 *
 * `fromMdast` は mdast (Markdown の AST) を Cosense の AST にする。記法の対応はここで決める。
 * Cosense の記法のテキストにするには、`@cosense-toolbox/parser/compile` の `toCosenseText` に渡す。
 */
export { fromMdast } from "./from-mdast"
