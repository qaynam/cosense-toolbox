/**
 * vite-plugin.ts — `.csn` / `.csnx` を Astro のコンポーネントのモジュールにする。
 */
import { fileURLToPath } from 'node:url'
import { type CompileOptions, compile } from '@cosense-toolbox/cosense-x'
import type { Plugin } from 'vite'
import { type SiteCache, idOf, isCosenseFile } from './site'

export const GRAPH_MODULE_ID = 'virtual:cosense-x/graph'
const RESOLVED_GRAPH_MODULE_ID = `\0${GRAPH_MODULE_ID}`

export type AstroCompileOptions = Omit<
  CompileOptions,
  'filePath' | 'format' | 'index' | 'jsxImportSource' | 'elementAttributeNameCase'
>

export interface VitePluginOptions {
  readonly root: URL
  /** 索引とグラフ。content collection の読み込みと共有する */
  readonly site: SiteCache
  readonly compile: AstroCompileOptions
  /** すべてのページに渡すコンポーネントを default export するモジュールの絶対パス */
  readonly components: string | undefined
}

/**
 * `@astrojs/mdx` と同じ形に整える。`Content` を default export にし、
 * Astro がそれを `astro:jsx` のコンポーネントとして描画できるよう印を付ける。
 */
const toAstroModule = (
  code: string,
  id: string,
  options: { components: string | undefined; layout: string | undefined; ssr: boolean },
): string => {
  const { components, layout, ssr } = options
  const content =
    layout === undefined
      ? ['export const Content = (props = {}) => __cosenseBody(props);']
      : // src/pages に置いたページを包むレイアウト。`.mdx` の `layout` と同じく、
        // 本文を default のスロットに入れ、frontmatter などを props で渡す。
        [
          `import __CosenseLayout from ${JSON.stringify(layout)};`,
          "import { jsx as __cosenseJsx } from 'astro/jsx-runtime';",
          'export const Content = (props = {}) => __cosenseJsx(__CosenseLayout, {',
          '  file, frontmatter, metadata,',
          '  children: __cosenseBody(props),',
          '});',
        ]
  const tag = ssr
    ? [
        "import { __astro_tag_component__ } from 'astro/runtime/server/index.js';",
        "__astro_tag_component__(Content, 'astro:jsx');",
      ]
    : []
  return [
    code.replace('export default function CosenseContent', 'function CosenseContent'),
    components === undefined
      ? 'const __cosenseComponents = {};'
      : `import __cosenseComponents from ${JSON.stringify(components)};`,
    `export const file = ${JSON.stringify(id)};`,
    'const __cosenseBody = (props) => CosenseContent({',
    '  ...props,',
    '  components: { ...__cosenseComponents, ...props.components },',
    '});',
    ...content,
    'export default Content;',
    "Content[Symbol.for('mdx-component')] = true;",
    // レイアウトがあれば <head> はレイアウトが出す。無ければ Astro に出させる。
    `Content[Symbol.for('astro.needsHeadRendering')] = ${layout === undefined};`,
    `Content.moduleId = ${JSON.stringify(id)};`,
    ...tag,
  ].join('\n')
}

export const vitePluginCosense = (options: VitePluginOptions): Plugin => {
  const root = fileURLToPath(options.root)
  const loadSite = options.site.get

  return {
    name: '@cosense-toolbox/astro',
    enforce: 'pre',

    resolveId(id) {
      return id === GRAPH_MODULE_ID ? RESOLVED_GRAPH_MODULE_ID : undefined
    },

    async load(id) {
      if (id !== RESOLVED_GRAPH_MODULE_ID) return undefined
      const { graph } = await loadSite()
      return `export const graph = ${JSON.stringify(graph)};\nexport default graph;`
    },

    transform: {
      filter: { id: /\.csnx?$/ },
      async handler(code, id) {
        const { index } = await loadSite()
        const result = await compile(code, {
          ...options.compile,
          filePath: idOf(root, id),
          index,
          jsxImportSource: 'astro',
        })
        for (const warning of result.warnings) this.warn(warning)
        const ssr = this.environment.name === 'ssr' || this.environment.name === 'prerender'
        const layout = result.frontmatter.layout
        return {
          code: toAstroModule(result.code, id, {
            components: options.components,
            layout: typeof layout === 'string' ? layout : undefined,
            ssr,
          }),
          map: null,
        }
      },
    },

    // 1 ページの変更で、ほかのページのリンク先やグラフも変わりうる。
    // 索引を作り直し、関わるモジュールをすべて捨てて再読み込みする。
    configureServer(server) {
      const onChange = (file: string) => {
        if (!isCosenseFile(file)) return
        options.site.reset()
        for (const environment of Object.values(server.environments)) {
          const graph = environment.moduleGraph
          for (const [id, module] of graph.idToModuleMap) {
            if (id === RESOLVED_GRAPH_MODULE_ID || isCosenseFile(id.split('?')[0] ?? '')) {
              graph.invalidateModule(module)
            }
          }
        }
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onChange)
      server.watcher.on('change', onChange)
      server.watcher.on('unlink', onChange)
    },
  }
}
