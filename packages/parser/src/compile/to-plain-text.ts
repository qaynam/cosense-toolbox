/**
 * to-plain-text.ts — AST を記法抜きのテキストに戻す。
 *
 * `createCompiler` のハンドラ機構をひととおり使った参照実装も兼ねる。
 */
import type { AnyNode } from '../types'
import { type NodeHandlers, createCompiler } from './create-compiler'

const INDENT_UNIT = '  '

const handlers: NodeHandlers<string> = {
  page: (node, ctx) => ctx.children(node).join('\n'),

  title: (node) => node.value,

  line: (node, ctx) => {
    const body = ctx.children(node).join('')
    const quote = node.quote ? '> ' : ''
    return INDENT_UNIT.repeat(node.indent) + quote + body
  },

  codeBlock: (node, ctx) =>
    [`${INDENT_UNIT.repeat(node.indent)}${node.filename}`, ...ctx.children(node)].join('\n'),
  codeLine: (node) => node.value,

  table: (node, ctx) => [node.name, ...ctx.children(node)].join('\n'),
  tableRow: (node, ctx) => ctx.children(node).join('\t'),
  tableCell: (node) => node.value,

  text: (node) => node.value,
  internalLink: (node) => node.label,
  externalLink: (node) => node.label,
  projectLink: (node) => node.label,
  hashtag: (node) => node.value,
  inlineCode: (node) => node.value,
  formula: (node) => node.value,
  icon: (node) => node.user,
  image: (node) => node.src,
  decoration: (node, ctx) => ctx.children(node).join(''),
}

// ハンドラの無いノード (拡張が足した独自ノード) でも中身は落とさない。
const compile = createCompiler<string>({
  handlers,
  fallback: (node, ctx) => ctx.children(node).join(''),
})

/** ページ (または任意のノード) を記法抜きのテキストにする。 */
export const toPlainText = (node: AnyNode): string => compile(node)
