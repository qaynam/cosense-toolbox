/**
 * `@cosense-toolbox/parser/compile` — AST を別の形式に変換する。
 * パースはしない (この層はパーサー本体を import しない)。
 *
 * HTML 系の出力 (hast / HTML の文字列) は `toHast` が描画の規則を持ち、`toHtml` はそれを文字列にする。
 * HTML 以外の形式 (プレーンテキストなど) は `createCompiler` で AST から直接作る。
 */
export { createCompiler } from './create-compiler'
export type {
  CompileContext,
  CompilerOptions,
  NodeHandler,
  NodeHandlers,
} from './create-compiler'
export {
  codeLanguageOf,
  codeLineNumbers,
  defaultClassNames,
  defaultHastHandlers,
  defaultPageUrl,
  safeHref,
  safeSrc,
  toHast,
} from './to-hast'
export type {
  HastContent,
  HastContext,
  HastHandler,
  HastHandlers,
  HastHighlighter,
  HastOptions,
  HastRenderOptions,
  HtmlClassNames,
  PageRefNode,
  RawNode,
  RenderExtension,
  RenderTransform,
  ResolvedHastOptions,
} from './to-hast'
export { escapeHtml, toHtml } from './to-html'
export type { Highlighter, HtmlOptions } from './to-html'
export { toPlainText } from './to-plain-text'
