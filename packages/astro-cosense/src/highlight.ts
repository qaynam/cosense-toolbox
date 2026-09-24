/**
 * highlight.ts — コードブロックを、Astro の Markdown と同じ shiki の設定で色付けする。
 *
 * `.md` / `.mdx` のコードブロックと見た目を揃えるため、`markdown.syntaxHighlight` と
 * `markdown.shikiConfig` をそのまま使う。
 */
import type { HastHighlighter } from '@cosense-toolbox/cosense-x'
import { codeLanguageOf, escapeHtml } from '@cosense-toolbox/parser/compile'
import type { AstroConfig } from 'astro'
import { type BundledLanguage, bundledLanguages, createHighlighter } from 'shiki'

type MarkdownConfig = AstroConfig['markdown']

/** `toHtml` の `highlight` に渡す形。 */
export type HtmlHighlighter = (code: string, language: string) => string

/**
 * `.csn` / `.csnx` のコードブロックの色付け。
 * `'astro'` は `markdown.syntaxHighlight` / `markdown.shikiConfig` に従い、関数なら自分で色付けする。
 */
export type SyntaxHighlightOption = 'astro' | false | HastHighlighter

export interface CodeHighlighter {
  /**
   * `source` のコードブロックの言語を読み込んでから、色付けする関数を返す。
   * `compile` や `toHtml` は色付けを同期で呼ぶので、言語は先に読み込んでおく。
   */
  readonly prepare: (source: string) => Promise<HastHighlighter>
  /** `prepare` の `toHtml` 版。利用者が hast の色付けを渡したときは無い */
  readonly prepareHtml?: (source: string) => Promise<HtmlHighlighter>
}

/** ほかのモジュール (virtual:cosense-x/highlight) と色付けを共有するための globalThis のキー。 */
export const HIGHLIGHTER_KEY = '@cosense-toolbox/astro/highlighter'

/** 行頭 (字下げの後) の `code:ファイル名` からコードブロックを見つける。 */
const CODE_BLOCK = /^[ \t]*code:(.+)$/gm

/** ページに出てくるコードブロックの言語名。`highlight` に渡るのと同じ決め方。 */
export const codeLanguagesIn = (source: string): string[] => [
  ...new Set(
    [...source.matchAll(CODE_BLOCK)].map((match) => codeLanguageOf((match[1] ?? '').trim())),
  ),
]

const isShiki = (setting: MarkdownConfig['syntaxHighlight']): boolean =>
  setting === 'shiki' || (typeof setting === 'object' && setting.type === 'shiki')

const excludedLanguagesOf = (setting: MarkdownConfig['syntaxHighlight']): readonly string[] =>
  typeof setting === 'object' ? (setting.excludeLangs ?? []) : []

/**
 * Astro の Markdown の設定で色付けする。shiki を使わない設定 (`false` や `'prism'`) なら undefined。
 * prism には相当するものが無いので、色付けしない。
 */
export const astroShikiHighlighter = (markdown: MarkdownConfig): CodeHighlighter | undefined => {
  if (!isShiki(markdown.syntaxHighlight)) return undefined
  const { langs, langAlias, theme, themes, defaultColor, transformers } = markdown.shikiConfig
  const excluded = new Set(excludedLanguagesOf(markdown.syntaxHighlight))
  const themed =
    Object.keys(themes).length > 0
      ? { themes, ...(defaultColor === undefined ? {} : { defaultColor }) }
      : { theme }
  // 最初に色付けするときに作る。色付けしないサイトで shiki を読み込まないため。
  let created: ReturnType<typeof createHighlighter> | undefined
  const highlighterOf = () => {
    created ??= createHighlighter({
      themes: Object.keys(themes).length > 0 ? Object.values(themes) : [theme],
      langs,
    })
    return created
  }
  const resolve = (language: string): string => langAlias[language] ?? language

  /** 読み込めた言語だけを色付けする。知らない言語は null (色付けせず 1 行ずつのまま) にする。 */
  const load = async (source: string) => {
    const highlighter = await highlighterOf()
    const loaded = new Set(highlighter.getLoadedLanguages())
    const wanted = codeLanguagesIn(source)
      .map(resolve)
      .filter((language) => !excluded.has(language) && !loaded.has(language))
      .filter((language): language is BundledLanguage => language in bundledLanguages)
    if (wanted.length > 0) await highlighter.loadLanguage(...wanted)
    const available = new Set(highlighter.getLoadedLanguages())
    return {
      highlighter,
      languageOf: (language: string): string | null => {
        const resolved = resolve(language)
        return excluded.has(resolved) || !available.has(resolved) ? null : resolved
      },
    }
  }

  return {
    prepare: async (source) => {
      const { highlighter, languageOf } = await load(source)
      return (code, language) => {
        const lang = languageOf(language)
        return lang === null
          ? null
          : highlighter.codeToHast(code, { lang, ...themed, transformers })
      }
    },
    prepareHtml: async (source) => {
      const { highlighter, languageOf } = await load(source)
      return (code, language) => {
        const lang = languageOf(language)
        // toHtml は戻り値を code の中身として埋め込むので、pre と code を出さない形 (inline) にする。
        return lang === null
          ? escapeHtml(code)
          : highlighter.codeToHtml(code, { lang, ...themed, transformers, structure: 'inline' })
      }
    },
  }
}

/** 利用者が渡した色付けをそのまま使う。 */
export const customHighlighter = (highlight: HastHighlighter): CodeHighlighter => ({
  prepare: async () => highlight,
})
