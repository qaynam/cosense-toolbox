/**
 * to-html.ts — AST を HTML の文字列にする。
 *
 * `toHast` で hast にしてから文字列にするだけの近道。描画の規則は `toHast` にしか持たない。
 * JSX など HTML 以外の出力とずれないようにするため。
 */
import type { Root } from 'hast'
import { toHtml as hastToHtml } from 'hast-util-to-html'

import type { AnyNode } from '../types'
import { type HastContent, type HastHighlighter, type HastOptions, toHast } from './to-hast'

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * `& < > " '` を実体参照に置き換える。テキストと属性値のどちらにも使える。
 * `highlight` に HTML の文字列を返すハイライタを渡すとき、色付けしない部分のエスケープに使う。
 */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)

/**
 * コードブロックの中身を色付けする。`toHast` の `highlight` に加えて、HTML の文字列も返せる。
 * **文字列はそのまま埋め込まれる**ため、エスケープは実装側の責任になる。
 * highlight.js や Prism のように HTML の文字列を返すハイライタを、そのまま渡せるようにするため。
 */
export type Highlighter = (code: string, language: string) => string | Root | HastContent[] | null

export interface HtmlOptions extends Omit<HastOptions, 'highlight'> {
  /** コードブロックの中身の色付け。 */
  readonly highlight?: Highlighter
  /**
   * 出力の先頭に `<style>` 要素として差し込む CSS。
   *
   * @defaultValue undefined。`<style>` を出さない
   */
  readonly style?: string
}

/** 文字列を返すハイライタを、hast の raw ノードを返す形にする。 */
const asHastHighlighter =
  (highlight: Highlighter): HastHighlighter =>
  (code, language) => {
    const result = highlight(code, language)
    return typeof result === 'string' ? [{ type: 'raw', value: result }] : result
  }

/**
 * ページ (または任意のノード) を HTML 文字列にする。`hast-util-to-html(toHast(node, options))` と同じ。
 *
 * テキストと属性値はエスケープし、`javascript:` のようなスキームの URL は属性ごと落とす。
 * `highlight` が返した文字列と、`handlers` が返した raw ノードはそのまま埋め込むので、
 * そこでのエスケープは書いた人の責任になる。
 */
export const toHtml = (node: AnyNode, options: HtmlOptions = {}): string => {
  const { highlight, style, ...rest } = options
  const hast = toHast(node, {
    ...rest,
    ...(highlight === undefined ? {} : { highlight: asHastHighlighter(highlight) }),
  })
  const html = hastToHtml(hast, {
    // highlight の文字列や handlers の raw ノードを、書いた人の意図どおり HTML として入れる。
    allowDangerousHtml: true,
    characterReferences: { useNamedReferences: true },
  })
  return style === undefined ? html : `<style>${style}</style>${html}`
}
