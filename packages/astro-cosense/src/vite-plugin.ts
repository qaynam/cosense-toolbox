/**
 * vite-plugin.ts — `.csn` / `.csnx` を Astro のコンポーネントのモジュールにする。
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile, type CompileOptions } from '@cosense-toolbox/cosense-x'
import { Option } from 'effect'
import type { Plugin } from 'vite'

import { ASSET_STORE_KEY, type AssetStore } from './assets'
import { type AstroRenderOptions, type CodeHighlighter, renderOptionsWith } from './highlight'
import { idOf, isCosenseFile, type SiteCache } from './site'

export const GRAPH_MODULE_ID = 'virtual:cosense-x/graph'
const RESOLVED_GRAPH_MODULE_ID = `\0${GRAPH_MODULE_ID}`
export const ASSETS_MODULE_ID = 'virtual:cosense-x/assets'
const RESOLVED_ASSETS_MODULE_ID = `\0${ASSETS_MODULE_ID}`

/**
 * `toHtml` などで自分で描画するページから、Cosense 上のファイルを置くための関数。
 * 置き場は統合が作って `globalThis` に置いたものを使う。ページの描画はビルドでも dev でも
 * 統合と同じプロセスで走るので、PAT をモジュールのコードに埋め込まずに済む。
 * 置き場が無いとき (実行時に描画する SSR など) は、元の URL のまま返す。
 */
const ASSETS_MODULE = `const store = () => globalThis[Symbol.for(${JSON.stringify(ASSET_STORE_KEY)})];
export const cosenseAsset = (url) => store()?.resolve(url) ?? Promise.resolve(url);
export const localizeCosenseAssets = (html) => store()?.localizeHtml(html) ?? Promise.resolve(html);
`

/** dev サーバーで返す Content-Type。ビルドでは静的なホスティングが拡張子から決める。 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
}

export interface AstroCompileOptions extends Omit<
  CompileOptions,
  'filePath' | 'format' | 'index' | 'jsxImportSource' | 'elementAttributeNameCase' | 'renderOptions'
> {
  /**
   * 描画の設定。parser の `toHast` のオプションがそのまま渡る
   * (`extensions` / `handlers` / `classNames` / `showPads` / `iconImageUrl` / `title`)。
   * コードブロックの色付けは `syntaxHighlight` で決める。
   */
  readonly renderOptions?: AstroRenderOptions
}

export interface VitePluginOptions {
  readonly root: URL
  /** 索引とグラフ。content collection の読み込みと共有する */
  readonly site: SiteCache
  readonly compile: AstroCompileOptions
  /** すべてのページに渡すコンポーネントを default export するモジュールの絶対パス */
  readonly components: string | undefined
  /** Cosense 上のファイルの置き場。無効にしたときは undefined */
  readonly assets: AssetStore | undefined
  /** コードブロックの色付け。色付けしないときは undefined */
  readonly highlighter: CodeHighlighter | undefined
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
      if (id === GRAPH_MODULE_ID) return RESOLVED_GRAPH_MODULE_ID
      if (id === ASSETS_MODULE_ID) return RESOLVED_ASSETS_MODULE_ID
      return undefined
    },

    async load(id) {
      if (id === RESOLVED_ASSETS_MODULE_ID) return ASSETS_MODULE
      if (id !== RESOLVED_GRAPH_MODULE_ID) return undefined
      const { graph } = await loadSite()
      return `export const graph = ${JSON.stringify(graph)};\nexport default graph;`
    },

    transform: {
      filter: { id: /\.csnx?$/ },
      async handler(code, id) {
        const { index } = await loadSite()
        const highlight = Option.fromNullable(await options.highlighter?.(code))
        const result = await compile(code, {
          ...options.compile,
          renderOptions: renderOptionsWith(options.compile.renderOptions, highlight),
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
      // dev では、取ってきたファイルを置き場のディレクトリから返す。ビルドでは出力先に写す。
      const assets = options.assets
      if (assets !== undefined) {
        server.middlewares.use(assets.publicPath, async (request, response, next) => {
          // アイコンの名前は日本語を含みうるので、URL のエンコードを戻す。basename で置き場の外は読ませない。
          const name = (() => {
            try {
              return decodeURIComponent(basename(request.url?.split('?')[0] ?? ''))
            } catch {
              return ''
            }
          })()
          const file = join(assets.cacheDir, basename(name))
          const found = await stat(file)
            .then((s) => s.isFile())
            .catch(() => false)
          if (!found) {
            next()
            return
          }
          const type = CONTENT_TYPES[extname(file)]
          if (type !== undefined) response.setHeader('content-type', type)
          createReadStream(file).pipe(response)
        })
      }

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
