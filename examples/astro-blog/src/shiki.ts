/**
 * コードブロックの色付けの設定。astro.config.mjs の markdown.shikiConfig (.md と .csn / .csnx) と、
 * toHtml で描画するページで同じものを使う。
 */
import { escapeHtml } from '@cosense-toolbox/parser/compile'
import type { ShikiConfig } from 'astro'
import { createHighlighter } from 'shiki'

export const shikiConfig = { theme: 'github-light' } satisfies Partial<ShikiConfig>

/**
 * toHtml の highlight に渡す色付け。toHtml は highlight を同期で呼ぶので、使う言語は先に読み込んでおく。
 * 読み込んでいない言語は色付けせずに出す。
 */
export const createCodeHighlight = async (
  langs: string[],
): Promise<(code: string, lang: string) => string> => {
  const shiki = await createHighlighter({ themes: [shikiConfig.theme], langs })
  // structure: 'inline' で、toHtml が包む code の中身だけを返す。
  return (code, lang) =>
    shiki.getLoadedLanguages().includes(lang)
      ? shiki.codeToHtml(code, { lang, theme: shikiConfig.theme, structure: 'inline' })
      : escapeHtml(code)
}
