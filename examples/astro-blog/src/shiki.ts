/**
 * コードブロックの色付けの設定。astro.config.mjs の markdown.shikiConfig (.md と .csn / .csnx) と、
 * toHtml で描画するページで同じものを使う。
 */
import { escapeHtml } from '@cosense-toolbox/parser/compile'
import type { ShikiConfig } from 'astro'
import { createHighlighter } from 'shiki'

export const shikiConfig = {
  theme: 'github-light',
} satisfies Partial<ShikiConfig>

const defaultLangs = [
  'bash',
  'bash',
  'css',
  'csv',
  'elm',
  'go',
  'groovy',
  'haskell',
  'html',
  'java',
  'javascript',
  'js',
  'json',
  'jsonc',
  'jsonl',
  'jsx',
  'less',
  'log',
  'lua',
  'nginx',
  'php',
  'powershell',
  'prisma',
  'ruby',
  'rust',
  'scala',
  'scss',
  'sh',
  'sql',
  'svelte',
  'toml',
  'ts',
  'tsv',
  'typescript',
  'vue',
  'vue-html',
  'yaml',
  'zig',
  'zsh',
]

/**
 * toHtml の highlight に渡す色付け。toHtml は highlight を同期で呼ぶので、使う言語は先に読み込んでおく。
 * 読み込んでいない言語は色付けせずに出す。
 */
export const createCodeHighlight = async (
  langs: string[] = defaultLangs,
): Promise<(code: string, lang: string) => string> => {
  const shiki = await createHighlighter({ themes: [shikiConfig.theme], langs })
  // toHtml は戻り値を code で包むので、外側の <pre><code> だけを剥がす。
  // structure: 'inline' にしないのは、行番号 (global.css) に使う行ごとの span.line を残すため。
  return (code, lang) =>
    shiki.getLoadedLanguages().includes(lang)
      ? shiki
          .codeToHtml(code, { lang, theme: shikiConfig.theme })
          .replace(/^<pre[^>]*><code>/, '')
          .replace(/<\/code><\/pre>$/, '')
      : escapeHtml(code)
}
