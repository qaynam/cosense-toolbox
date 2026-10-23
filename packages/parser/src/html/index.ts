/**
 * `@cosense-toolbox/parser/html` — AST を HTML 系の出力 (hast と HTML の文字列) にする。
 * パースはしない (この層はパーサー本体を import しない)。
 *
 * 描画の規則は `toHast` だけが持ち、`toHtml` はその出力を文字列にする。
 * 描画の拡張 (`codeLineNumbers` など) もここから出す。HTML が要る人だけが読み込む入口なので、
 * 使わない拡張は tree-shaking で落ちる。
 * HTML 以外の形式 (プレーンテキストなど) は `./compile` の `createCompiler` で AST から直接作る。
 *
 * `handlers` や `extensions` は hast を返すので、その型 (`Element` など) もここから出す。
 * hast を組み立てる `h` は出さない。hastscript の API が、このパッケージの semver の約束に入らないようにするため。
 * 組み立てたい人は hastscript を自分で入れる。
 */
export type { Element, ElementContent, Root } from "hast"
export {
  codeLanguageOf,
  defaultClassNames,
  defaultHastHandlers,
  defaultPageUrl,
  safeHref,
  safeSrc,
  toHast,
} from "./to-hast"
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
} from "./to-hast"
export { escapeHtml, toHtml } from "./to-html"
export type { Highlighter, HtmlOptions } from "./to-html"
export { codeLineNumbers } from "./code-line-numbers"
export { tableCellLineBreaks } from "./table-cell-line-breaks"
