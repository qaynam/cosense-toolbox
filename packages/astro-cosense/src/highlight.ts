/**
 * highlight.ts — コードブロックを、Astro の Markdown と同じ shiki の設定で色付けする。
 *
 * `.md` / `.mdx` のコードブロックと見た目を揃えるため、`markdown.syntaxHighlight` と
 * `markdown.shikiConfig` をそのまま使う。
 */
import type { HastHighlighter, RenderOptions } from "@cosense-toolbox/cosense-x"
import { codeLanguageOf } from "@cosense-toolbox/parser/html"
import type { AstroConfig } from "astro"
import { Effect, Match, Option, pipe } from "effect"
import { type BundledLanguage, bundledLanguages, createHighlighter } from "shiki"

type MarkdownConfig = AstroConfig["markdown"]

/**
 * `.csn` / `.csnx` のコードブロックの色付け。
 * `'astro'` は `markdown.syntaxHighlight` / `markdown.shikiConfig` に従い、関数なら自分で色付けする。
 */
export type SyntaxHighlightOption = "astro" | false | HastHighlighter

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
    [...source.matchAll(CODE_BLOCK)].map((match) => codeLanguageOf((match[1] ?? "").trim())),
  ),
]

/** shiki を使う設定なら、色付けしない言語 (`excludeLangs`) の一覧。shiki を使わない設定なら None。 */
const shikiExclusionsOf = (
  setting: MarkdownConfig["syntaxHighlight"],
): Option.Option<readonly string[]> =>
  Match.value(setting).pipe(
    Match.when("shiki", () => Option.some([])),
    Match.when({ type: "shiki" }, (config) => Option.some(config.excludeLangs ?? [])),
    Match.orElse(() => Option.none()),
  )

type Shiki = Awaited<ReturnType<typeof createHighlighter>>

/**
 * Astro の Markdown の設定で色付けする。shiki を使わない設定 (`false` や `'prism'`) なら undefined。
 * prism には相当するものが無いので、色付けしない。
 */
export const astroShikiHighlighter = (markdown: MarkdownConfig): CodeHighlighter | undefined =>
  pipe(
    shikiExclusionsOf(markdown.syntaxHighlight),
    Option.map((excluded) => shikiHighlighter(markdown.shikiConfig, new Set(excluded))),
    Option.getOrUndefined,
  )

const shikiHighlighter = (
  { langs, langAlias, theme, themes, defaultColor, transformers }: MarkdownConfig["shikiConfig"],
  excluded: ReadonlySet<string>,
): CodeHighlighter => {
  const multiple = Object.keys(themes).length > 0
  const themed = multiple
    ? { themes, ...(defaultColor === undefined ? {} : { defaultColor }) }
    : { theme }
  // 最初に色付けするときに 1 度だけ作る。色付けしないサイトで shiki を読み込まないため。
  const shiki = Effect.runSync(
    Effect.cached(
      Effect.promise(() =>
        createHighlighter({ themes: multiple ? Object.values(themes) : [theme], langs }),
      ),
    ),
  )
  const resolve = (language: string): string =>
    Option.getOrElse(Option.fromNullable(langAlias[language]), () => language)

  /** ページに出てくる言語のうち、読み込んでいないものを読み込む。shiki が知らない言語は飛ばす。 */
  const loadLanguagesIn = (source: string) => (highlighter: Shiki) => {
    const loaded = new Set(highlighter.getLoadedLanguages())
    const wanted = codeLanguagesIn(source)
      .map(resolve)
      .filter((language) => !excluded.has(language) && !loaded.has(language))
      .filter((language): language is BundledLanguage => language in bundledLanguages)
    return pipe(
      Effect.promise(() => highlighter.loadLanguage(...wanted)),
      Effect.when(() => wanted.length > 0),
    )
  }

  /** 読み込めた言語だけを色付けする。知らない言語は null (色付けせず 1 行ずつのまま) にする。 */
  const highlightWith = (highlighter: Shiki): HastHighlighter => {
    const available = new Set(highlighter.getLoadedLanguages())
    return (code, language) =>
      pipe(
        Option.some(resolve(language)),
        Option.filter((lang) => !excluded.has(lang) && available.has(lang)),
        Option.map((lang) => highlighter.codeToHast(code, { lang, ...themed, transformers })),
        Option.getOrNull,
      )
  }

  return (source) =>
    pipe(shiki, Effect.tap(loadLanguagesIn(source)), Effect.map(highlightWith), Effect.runPromise)
}

/** 利用者が渡した色付けをそのまま使う。 */
export const customHighlighter =
  (highlight: HastHighlighter): CodeHighlighter =>
  async () =>
    highlight

/**
 * 利用者が統合に渡す描画の設定。色付けは統合が `syntaxHighlight` から作って渡すので含めない。
 */
export type AstroRenderOptions = Omit<RenderOptions, "highlight">

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
