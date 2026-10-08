/**
 * `@cosense-toolbox/parser/markdown` — mdast (Markdown の AST) を Cosense の AST にする。
 *
 * Markdown の文字列を mdast にする部品 (micromark) は大きいので、このパッケージには入れない。
 * 文字列から読むときは、`mdast-util-from-markdown` などで作った mdast を渡す。
 */
export { fromMdast } from "./from-mdast"
