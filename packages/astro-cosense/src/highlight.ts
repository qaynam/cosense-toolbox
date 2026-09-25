/**
 * highlight.ts — コードブロックを、Astro の Markdown と同じ shiki の設定で色付けする。
 *
 * `.md` / `.mdx` のコードブロックと見た目を揃えるため、`markdown.syntaxHighlight` と
 * `markdown.shikiConfig` をそのまま使う。
 */
import type { HastHighlighter, RenderOptions } from '@cosense-toolbox/cosense-x'
import { codeLanguageOf } from '@cosense-toolbox/parser/compile'
import type { AstroConfig } from 'astro'
import { Option, pipe } from 'effect'
import { type BundledLanguage, bundledLanguages, createHighlighter } from 'shiki'

type MarkdownConfig = AstroConfig['markdown']

/**
 * `.csn` / `.csnx` のコードブロックの色付け。
 * `'astro'` は `markdown.syntaxHighlight` / `markdown.shikiConfig` に従い、関数なら自分で色付けする。
 */
export type SyntaxHighlightOption = 'astro' | false | HastHighlighter

/**
 * `source` のコードブロックの言語を読み込んでから、色付けする関数を返す。
 * `compile` は色付けを同期で呼ぶので、言語は先に読み込んでおく。
 */
export type CodeHighlighter = (source: string) => Promise<HastHighlighter>

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

  return async (source) => {
    const highlighter = await highlighterOf()
    const loaded = new Set(highlighter.getLoadedLanguages())
    const wanted = codeLanguagesIn(source)
      .map(resolve)
      .filter((language) => !excluded.has(language) && !loaded.has(language))
      .filter((language): language is BundledLanguage => language in bundledLanguages)
    if (wanted.length > 0) await highlighter.loadLanguage(...wanted)
    const available = new Set(highlighter.getLoadedLanguages())
    // 読み込めた言語だけを色付けする。知らない言語は null (色付けせず 1 行ずつのまま) にする。
    return (code, language) => {
      const lang = resolve(language)
      return excluded.has(lang) || !available.has(lang)
        ? null
        : highlighter.codeToHast(code, {
            lang,
            ...themed,
            transformers,
          })
    }
  }
}

/** 利用者が渡した色付けをそのまま使う。 */
export const customHighlighter =
  (highlight: HastHighlighter): CodeHighlighter =>
  async () =>
    highlight

/**
 * 利用者が統合に渡す描画の設定。色付けは統合が `syntaxHighlight` から作って渡すので含めない。
 */
export type AstroRenderOptions = Omit<RenderOptions, 'highlight'>

/**
 * 利用者の `renderOptions` に、統合が作った色付けを足す。色付けしない設定なら何も足さない。
 */
export const renderOptionsWith = (
  renderOptions: AstroRenderOptions | undefined,
  highlight: Option.Option<HastHighlighter>,
): RenderOptions =>
  pipe(
    highlight,
    Option.match({
      onNone: (): RenderOptions => ({ ...renderOptions }),
      onSome: (value): RenderOptions => ({ ...renderOptions, highlight: value }),
    }),
  )
