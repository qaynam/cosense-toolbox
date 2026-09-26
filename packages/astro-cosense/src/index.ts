/**
 * `@cosense-toolbox/astro` — `.csn` / `.csnx` を Astro のページと content collection で使う。
 *
 * ```js
 * // astro.config.mjs
 * import cosense from '@cosense-toolbox/astro'
 * export default defineConfig({
 *   integrations: [cosense({ pageUrl: (page) => `/posts/${page.slug}` })],
 * })
 * ```
 */
import { fileURLToPath } from "node:url"

import { readPage } from "@cosense-toolbox/cosense-x/graph"
import type {
  AstroConfig,
  AstroIntegration,
  AstroIntegrationLogger,
  ContentEntryType,
  HookParameters,
} from "astro"
import { Array as Arr, Effect, pipe } from "effect"

import { ASSET_STORE_KEY, type AssetStore, createAssetStore, rehypeCosenseAssets } from "./assets"
import {
  astroShikiHighlighter,
  type CodeHighlighter,
  customHighlighter,
  type SyntaxHighlightOption,
} from "./highlight"
import { type CosenseLintOptions, type LintResult, lintSite } from "./lint"
import { createSiteCache, EXTENSIONS, idOf, isCosenseFile } from "./site"
import {
  ASSETS_MODULE_ID,
  type AstroCompileOptions,
  GRAPH_MODULE_ID,
  vitePluginCosense,
} from "./vite-plugin"

export interface CosenseAssetsOptions {
  /**
   * Cosense の Personal Access Token。非公開プロジェクトの画像を取ってくるときに渡す。
   * Cosense への要求にだけ付け、リダイレクト先 (Google Cloud Storage や Gyazo) には送らない。
   *
   * @example `process.env.COSENSE_PAT`
   */
  readonly pat?: string
  /** Cosense の origin。 @defaultValue `https://scrapbox.io` */
  readonly origin?: string
  /**
   * リンクした Cosense のファイル (`[https://scrapbox.io/files/x.zip]` など) の扱い。画像は常に取ってくる。
   * `'keep'` は元の URL のまま (公開プロジェクトならクリックで開ける)、`'download'` は取ってきてサイトに置く。
   * 非公開プロジェクトのファイルは `'download'` でないと、見に来た人が開けない。
   *
   * @defaultValue `'keep'`
   */
  readonly links?: "keep" | "download"
}

export interface CosenseIntegrationOptions extends AstroCompileOptions {
  /**
   * すべてのページに渡すコンポーネントを default export するモジュール (プロジェクトのルートからのパス)。
   * `.csnx` の `<Name />` や、`a` などの要素の差し替えに使う。
   * `<Content components={...} />` で渡したものがあれば、そちらが優先する。
   *
   * @example `'./src/components/cosense.ts'`
   */
  readonly components?: string
  /**
   * Cosense 上の画像やファイル (`/files/…` とアイコン) を、ビルド時に取ってきてサイトの中
   * (`{base}/_cosense/`) に置く。`false` なら元の URL のまま出す。
   *
   * Cosense のファイルは別のサイトからは読めず、リダイレクト先の URL も数分で切れるので、
   * 静的なサイトで表示するにはこうするしかない。非公開プロジェクトの画像も公開されることになる点に注意。
   *
   * @defaultValue `{}` (有効)
   */
  readonly assets?: CosenseAssetsOptions | false
  /**
   * コードブロックの色付け。
   *
   * - `'astro'`: `.md` / `.mdx` と同じく、Astro の `markdown.syntaxHighlight` と `markdown.shikiConfig` に従う。
   *   shiki のときだけ色付けし、prism には対応していない
   * - `false`: 色付けしない
   * - 関数: `(code, language) => hast | null` で自分で色付けする
   *
   * @defaultValue `'astro'`
   */
  readonly syntaxHighlight?: SyntaxHighlightOption
  /**
   * ビルドの前に、`srcDir` の下のページのリンク切れを調べる。エディタの診断
   * (`@cosense-toolbox/lsp`) と同じ判定で、`unresolvedLinks: 'error'` ならビルドを止める。
   * 省略すると調べない。
   *
   * @example `{ unresolvedLinks: 'error' }`
   */
  readonly lint?: CosenseLintOptions
}

/** サイトのリンク切れを調べ、見つかったものをログに出す。 */
const reportLint = (
  config: AstroConfig,
  lint: CosenseLintOptions,
  compileOptions: AstroCompileOptions,
  logger: AstroIntegrationLogger,
): Effect.Effect<LintResult> =>
  pipe(
    lintSite(
      fileURLToPath(config.root),
      fileURLToPath(config.srcDir),
      lint,
      compileOptions.parseOptions,
    ),
    Effect.tap(({ errors, warnings }) =>
      Effect.all([
        Effect.forEach(warnings, (warning) => Effect.sync(() => logger.warn(warning))),
        Effect.forEach(errors, (error) => Effect.sync(() => logger.error(error))),
      ]),
    ),
  )

/** ビルドでは、error があれば失敗してビルドを止める。 */
const stopOnErrors = ({ errors }: LintResult): Effect.Effect<void, Error> =>
  Arr.match(errors, {
    onEmpty: () => Effect.void,
    onNonEmpty: (found) =>
      Effect.fail(new Error(`リンク切れが ${found.length} 件あるので、ビルドを止めた`)),
  })

/**
 * 開発中は止めずに知らせるだけにする。何も無いときも 1 行出して、調べたことが分かるようにする。
 */
const noteWhenClean =
  (logger: AstroIntegrationLogger) =>
  ({ errors, warnings }: LintResult): Effect.Effect<void> =>
    Arr.isEmptyReadonlyArray([...errors, ...warnings])
      ? Effect.sync(() => logger.info("リンク切れは見つからなかった"))
      : Effect.void

/** `{base}/_cosense/`。base の末尾の `/` の有無を吸収する。 */
const assetsPathOf = (config: AstroConfig): string => `${config.base.replace(/\/$/, "")}/_cosense/`

/** 静的なサイトでは出力先そのもの、サーバー出力ではクライアント向けの出力先に置く。 */
const assetsDirOf = (config: AstroConfig, dir: URL): URL =>
  new URL("_cosense/", config.output === "static" ? dir : config.build.client)

/**
 * `astro:config:setup` の引数のうち、型定義に載っていないもの。
 * `@astrojs/mdx` も使っている、ページの拡張子と content collection の形式を足す口。
 */
interface HiddenSetupHooks {
  readonly addPageExtension: (extension: string) => void
  readonly addContentEntryType: (contentEntryType: ContentEntryType) => void
}

const CONTENT_MODULE_TYPES = EXTENSIONS.map(
  (extension) => `  '${extension}': Promise<{ Content: import('astro').MDXContent }>;`,
)

const CONTENT_TYPES = `declare module 'astro:content' {
  interface Render {
${CONTENT_MODULE_TYPES.join("\n")}
  }
}
`

const INJECTED_TYPES = `declare module '${GRAPH_MODULE_ID}' {
  export const graph: import('@cosense-toolbox/cosense-x/graph').Graph;
  export default graph;
}
declare module '${ASSETS_MODULE_ID}' {
  /** Cosense 上のファイルなら、ビルド時に取ってきて置いたサイトの中の URL を返す。それ以外はそのまま返す */
  export const cosenseAsset: (url: string) => Promise<string>;
  /** HTML の src / href のうち、Cosense 上のファイルを指すものを差し替える (toHtml の出力に使う) */
  export const localizeCosenseAssets: (html: string) => Promise<string>;
}
${EXTENSIONS.map(
  (extension) => `
declare module '*${extension}' {
  export const frontmatter: Record<string, unknown>;
  export const metadata: import('@cosense-toolbox/cosense-x').PageMetadata;
  export const file: string;
  export const Content: import('astro').MDXContent;
  export default Content;
}`,
).join("\n")}
`

export default function cosense(options: CosenseIntegrationOptions = {}): AstroIntegration {
  const {
    components,
    assets: assetsOptions = {},
    syntaxHighlight = "astro",
    lint,
    ...compileOptions
  } = options
  // config:setup で作る。ビルドの始まりと終わりのフックからも使う。
  let assets: AssetStore | undefined
  let astroConfig: AstroConfig | undefined
  return {
    name: "@cosense-toolbox/astro",
    hooks: {
      "astro:config:setup": (params: HookParameters<"astro:config:setup">) => {
        const { addPageExtension, addContentEntryType } = params as unknown as HiddenSetupHooks
        const { config, addRenderer, updateConfig, logger } = params
        const root = fileURLToPath(config.root)
        assets =
          assetsOptions === false
            ? undefined
            : createAssetStore({
                cacheDir: fileURLToPath(new URL("cosense-assets/", config.cacheDir)),
                publicPath: assetsPathOf(config),
                fetchOptions: {
                  ...(assetsOptions.pat === undefined ? {} : { pat: assetsOptions.pat }),
                  ...(assetsOptions.origin === undefined ? {} : { origin: assetsOptions.origin }),
                },
                ...(assetsOptions.links === undefined ? {} : { links: assetsOptions.links }),
                warn: (message) => logger.warn(message),
              })
        const highlighter: CodeHighlighter | undefined =
          syntaxHighlight === false
            ? undefined
            : syntaxHighlight === "astro"
              ? astroShikiHighlighter(config.markdown)
              : customHighlighter(syntaxHighlight)
        // toHtml などで自分で描画するページが、virtual:cosense-x/assets から使う。
        Object.assign(globalThis, { [Symbol.for(ASSET_STORE_KEY)]: assets })
        const site = createSiteCache(
          root,
          fileURLToPath(config.srcDir),
          options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions },
        )

        addRenderer({
          name: "astro:jsx",
          serverEntrypoint: new URL("./server.mjs", import.meta.url),
        })
        for (const extension of EXTENSIONS) addPageExtension(extension)

        addContentEntryType({
          extensions: [...EXTENSIONS],
          async getEntryInfo({ fileUrl, contents }) {
            const { frontmatter, metadata, body } = readPage(contents, {
              filePath: idOf(root, fileURLToPath(fileUrl)),
              ...(options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions }),
            })
            // Cosense では 1 行目がタイトルなので、frontmatter に無くても title などを data に入れる。
            const { links: _links, ...fields } = metadata
            return {
              data: { ...frontmatter, ...fields },
              body,
              slug: metadata.slug,
              rawData: "",
            }
          },
          contentModuleTypes: CONTENT_TYPES,
          handlePropagation: true,
        })

        updateConfig({
          vite: {
            plugins: [
              vitePluginCosense({
                root: config.root,
                site,
                compile:
                  assets === undefined
                    ? compileOptions
                    : {
                        ...compileOptions,
                        // 利用者のプラグインが足した画像も差し替えられるよう、最後に当てる。
                        rehypePlugins: [
                          ...(compileOptions.rehypePlugins ?? []),
                          rehypeCosenseAssets(assets),
                        ],
                      },
                assets,
                highlighter,
                components:
                  components === undefined
                    ? undefined
                    : fileURLToPath(new URL(components, config.root)),
              }),
            ],
          },
        })
      },

      "astro:config:done": ({ config, injectTypes }) => {
        astroConfig = config
        injectTypes({ filename: "types.d.ts", content: INJECTED_TYPES })
      },

      "astro:build:start": async ({ logger }) => {
        if (lint === undefined || astroConfig === undefined) return
        await Effect.runPromise(
          Effect.flatMap(reportLint(astroConfig, lint, compileOptions, logger), stopOnErrors),
        )
      },

      // 開発中は起動したときと、ページを足した・変えた・消したときに調べ直す。
      "astro:server:setup": ({ server, logger }) => {
        if (lint === undefined || astroConfig === undefined) return
        const config = astroConfig
        const check = () =>
          Effect.runFork(
            Effect.flatMap(reportLint(config, lint, compileOptions, logger), noteWhenClean(logger)),
          )
        const onChange = (file: string) => {
          if (isCosenseFile(file)) check()
        }
        server.watcher.on("add", onChange)
        server.watcher.on("change", onChange)
        server.watcher.on("unlink", onChange)
        check()
      },

      // 置き場のディレクトリはビルドをまたいで残し、中身の変わらないファイルは取り直さない。
      // 出力先には、このビルドで使ったファイルだけを写す。
      "astro:build:done": async ({ dir }) => {
        if (assets === undefined || astroConfig === undefined) return
        await assets.copyUsedTo(assetsDirOf(astroConfig, dir))
      },
    },
  }
}

export type { Graph, GraphPage, TwoHopGroup } from "@cosense-toolbox/cosense-x/graph"
