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
import { cp, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { readPage } from '@cosense-toolbox/cosense-x/graph'
import type { AstroConfig, AstroIntegration, ContentEntryType, HookParameters } from 'astro'
import { ASSET_STORE_KEY, type AssetStore, createAssetStore, rehypeCosenseAssets } from './assets'
import { EXTENSIONS, createSiteCache, idOf } from './site'
import {
  ASSETS_MODULE_ID,
  type AstroCompileOptions,
  GRAPH_MODULE_ID,
  vitePluginCosense,
} from './vite-plugin'

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
}

/** `{base}/_cosense/`。base の末尾の `/` の有無を吸収する。 */
const assetsPathOf = (config: AstroConfig): string => `${config.base.replace(/\/$/, '')}/_cosense/`

/** 静的なサイトでは出力先そのもの、サーバー出力ではクライアント向けの出力先に置く。 */
const assetsDirOf = (config: AstroConfig, dir: URL): URL =>
  new URL('_cosense/', config.output === 'static' ? dir : config.build.client)

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
${CONTENT_MODULE_TYPES.join('\n')}
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
).join('\n')}
`

export default function cosense(options: CosenseIntegrationOptions = {}): AstroIntegration {
  const { components, assets: assetsOptions = {}, ...compileOptions } = options
  // config:setup で作る。ビルドの始まりと終わりのフックからも使う。
  let assets: AssetStore | undefined
  let astroConfig: AstroConfig | undefined
  return {
    name: '@cosense-toolbox/astro',
    hooks: {
      'astro:config:setup': (params: HookParameters<'astro:config:setup'>) => {
        const { addPageExtension, addContentEntryType } = params as unknown as HiddenSetupHooks
        const { config, addRenderer, updateConfig, logger } = params
        const root = fileURLToPath(config.root)
        assets =
          assetsOptions === false
            ? undefined
            : createAssetStore({
                cacheDir: fileURLToPath(new URL('cosense-assets/', config.cacheDir)),
                publicPath: assetsPathOf(config),
                fetchOptions: {
                  ...(assetsOptions.pat === undefined ? {} : { pat: assetsOptions.pat }),
                  ...(assetsOptions.origin === undefined ? {} : { origin: assetsOptions.origin }),
                },
                warn: (message) => logger.warn(message),
              })
        // toHtml などで自分で描画するページが、virtual:cosense-x/assets から使う。
        Object.assign(globalThis, { [Symbol.for(ASSET_STORE_KEY)]: assets })
        const site = createSiteCache(
          root,
          fileURLToPath(config.srcDir),
          options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions },
        )

        addRenderer({
          name: 'astro:jsx',
          serverEntrypoint: new URL('./server.mjs', import.meta.url),
        })
        for (const extension of EXTENSIONS) addPageExtension(extension)

        addContentEntryType({
          extensions: [...EXTENSIONS],
          async getEntryInfo({ fileUrl, contents }) {
            // 説明文の中の相対パスのリンクをタイトルにするため、索引を渡して読む。
            const { index } = await site.get()
            const { frontmatter, metadata, body } = readPage(contents, {
              filePath: idOf(root, fileURLToPath(fileUrl)),
              index,
              ...(options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions }),
            })
            // Cosense では 1 行目がタイトルなので、frontmatter に無くても title などを data に入れる。
            const { links: _links, ...fields } = metadata
            return {
              data: { ...frontmatter, ...fields },
              body,
              slug: metadata.slug,
              rawData: '',
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
                components:
                  components === undefined
                    ? undefined
                    : fileURLToPath(new URL(components, config.root)),
              }),
            ],
          },
        })
      },

      'astro:config:done': ({ config, injectTypes }) => {
        astroConfig = config
        injectTypes({ filename: 'types.d.ts', content: INJECTED_TYPES })
      },

      // 前のビルドで取ってきたファイルが、使わなくなっても出力に残らないようにする。
      'astro:build:start': async () => {
        if (assets !== undefined) await rm(assets.cacheDir, { recursive: true, force: true })
      },

      'astro:build:done': async ({ dir }) => {
        if (assets === undefined || astroConfig === undefined) return
        const exists = await stat(assets.cacheDir).then(
          () => true,
          () => false,
        )
        if (exists) await cp(assets.cacheDir, assetsDirOf(astroConfig, dir), { recursive: true })
      },
    },
  }
}

export type { Graph, GraphPage, TwoHopGroup } from '@cosense-toolbox/cosense-x/graph'
