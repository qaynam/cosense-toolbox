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
import { fileURLToPath } from 'node:url'
import { readPage } from '@cosense-toolbox/cosense-x/graph'
import type { AstroIntegration, ContentEntryType, HookParameters } from 'astro'
import { EXTENSIONS } from './site'
import { type AstroCompileOptions, GRAPH_MODULE_ID, vitePluginCosense } from './vite-plugin'

export interface CosenseIntegrationOptions extends AstroCompileOptions {
  /**
   * すべてのページに渡すコンポーネントを default export するモジュール (プロジェクトのルートからのパス)。
   * `.csnx` の `<Name />` や、`a` などの要素の差し替えに使う。
   * `<Content components={...} />` で渡したものがあれば、そちらが優先する。
   *
   * @example `'./src/components/cosense.ts'`
   */
  readonly components?: string
}

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
  const { components, ...compileOptions } = options
  return {
    name: '@cosense-toolbox/astro',
    hooks: {
      'astro:config:setup': (params: HookParameters<'astro:config:setup'>) => {
        const { addPageExtension, addContentEntryType } = params as unknown as HiddenSetupHooks
        const { config, addRenderer, updateConfig } = params

        addRenderer({
          name: 'astro:jsx',
          serverEntrypoint: new URL('./server.mjs', import.meta.url),
        })
        for (const extension of EXTENSIONS) addPageExtension(extension)

        addContentEntryType({
          extensions: [...EXTENSIONS],
          getEntryInfo({ fileUrl, contents }) {
            const filePath = fileURLToPath(fileUrl)
            const { frontmatter, metadata, body } = readPage(contents, {
              filePath,
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
                srcDir: config.srcDir,
                compile: compileOptions,
                components:
                  components === undefined
                    ? undefined
                    : fileURLToPath(new URL(components, config.root)),
              }),
            ],
          },
        })
      },

      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'types.d.ts', content: INJECTED_TYPES })
      },
    },
  }
}

export type { Graph, GraphPage, TwoHopGroup } from '@cosense-toolbox/cosense-x/graph'
