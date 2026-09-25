/**
 * `@cosense-toolbox/parser/compile` — AST を別の形式に変換するための土台。
 * パースはしない (この層はパーサー本体を import しない)。
 *
 * ノード型ごとのハンドラで出力を組み立てる `createCompiler` と、その参照実装の `toPlainText`。
 * HTML 系の出力 (hast / HTML の文字列) は `./html` にある。
 */
export { createCompiler } from './create-compiler'
export type { CompileContext, CompilerOptions, NodeHandler, NodeHandlers } from './create-compiler'
export { toPlainText } from './to-plain-text'
