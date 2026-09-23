import type {
  Expression,
  ObjectExpression,
  Program,
  Property,
  SpreadElement,
  Statement,
} from 'estree'
import type {
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXIdentifier,
  JSXMemberExpression,
} from 'estree-jsx'
import { buildJsx } from 'estree-util-build-jsx'
import { toJs } from 'estree-util-to-js'
import { valueToEstree } from 'estree-util-value-to-estree'
/**
 * compile.ts — `.csn` / `.csnx` を JS モジュールにする。MDX の compile にあたる。
 *
 * Cosense の AST を hast にし、そこから先は MDX と同じ公開パッケージ
 * (hast-util-to-estree → estree-util-build-jsx → estree-util-to-js) で JS にする。
 *
 * 出力するモジュールの形:
 *
 * ```js
 * export const frontmatter = {...}
 * export const metadata = {...}
 * export default function CosenseContent(props = {}) {
 *   const _components = { div: 'div', ..., ...props.components }
 *   return <_components.div>...</_components.div>
 * }
 * ```
 *
 * 要素をすべて `_components` 経由で引くので、`props.components` で `a` や `img` も差し替えられる。
 */
import type { Root } from 'hast'
import { type Handle, toEstree } from 'hast-util-to-estree'
import { type PluggableList, unified } from 'unified'
import type { Frontmatter } from './frontmatter'
import { type LinkOptions, createLinkResolver } from './links'
import type { PageMetadata } from './metadata'
import { type Format, type ReadOptions, readPage } from './read'
import { type CosenseComponent, type ToHastOptions, toHast } from './to-hast'

export interface CompileOptions
  extends LinkOptions,
    Omit<ReadOptions, 'filePath'>,
    Pick<ToHastOptions, 'classNames' | 'iconImageUrl' | 'showPads' | 'title'> {
  /** 形式 (`format`) を省いたときは、このパスの拡張子で決める */
  readonly filePath?: string
  /**
   * JSX ランタイムを読み込む元。`{jsxImportSource}/jsx-runtime` から `jsx` を import する。
   *
   * @defaultValue `'react'`
   */
  readonly jsxImportSource?: string
  /**
   * 要素の属性名の書き方。React は `className`、それ以外 (Astro・Preact・Vue) は `class`。
   *
   * @defaultValue `jsxImportSource` が `react` なら `'react'`、それ以外は `'html'`
   */
  readonly elementAttributeNameCase?: 'html' | 'react'
  /** hast に当てる rehype プラグイン。 */
  readonly rehypePlugins?: PluggableList
}

export interface CompileResult {
  /** ES モジュールの JS */
  readonly code: string
  readonly format: Format
  readonly frontmatter: Frontmatter
  readonly metadata: PageMetadata
  /** `unresolved: 'warn'` のときのリンク切れなど */
  readonly warnings: readonly string[]
}

const COMPONENTS = '_components'

const identifier = (name: string) => ({ type: 'Identifier' as const, name })
const jsxIdentifier = (name: string): JSXIdentifier => ({ type: 'JSXIdentifier', name })
const jsxMember = (name: string): JSXMemberExpression => ({
  type: 'JSXMemberExpression',
  object: jsxIdentifier(COMPONENTS),
  property: jsxIdentifier(name),
})

/**
 * コンポーネントの呼び出しを JSX にする。渡されていなければ、元の開始タグと閉じタグの行を
 * children の前後に置いてそのまま出す。
 * MDX のように例外にしないのは、Cosense で書いたページを壊さずに表示するため。
 */
const handleComponent: Handle = (node: CosenseComponent, state) => {
  const children = state.all(node)
  const attributes: JSXAttribute[] = node.attributes.map((attribute) => ({
    type: 'JSXAttribute',
    name: state.createJsxAttributeName(attribute.name) as JSXAttribute['name'],
    value:
      attribute.value === true
        ? null
        : typeof attribute.value === 'string'
          ? { type: 'Literal', value: attribute.value }
          : { type: 'JSXExpressionContainer', expression: valueToEstree(attribute.value) },
  }))
  const call: JSXElement = {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: jsxMember(node.name),
      attributes,
      selfClosing: children.length === 0,
    },
    closingElement:
      children.length === 0 ? null : { type: 'JSXClosingElement', name: jsxMember(node.name) },
    children,
  }
  const fallbackLine = state.handle(node.fallback)
  const fallbackEnd = node.fallbackEnd === null ? null : state.handle(node.fallbackEnd)
  const fallback: Expression = {
    type: 'JSXFragment',
    openingFragment: { type: 'JSXOpeningFragment' },
    closingFragment: { type: 'JSXClosingFragment' },
    // 同じノードを 2 か所に置くと、後段の変換がその場で書き換えたときに両方壊れるので複製する。
    children: [
      ...(fallbackLine ? [fallbackLine] : []),
      ...structuredClone(children),
      ...(fallbackEnd ? [fallbackEnd] : []),
    ],
  } as Expression
  const container: JSXExpressionContainer = {
    type: 'JSXExpressionContainer',
    expression: {
      type: 'ConditionalExpression',
      test: {
        type: 'MemberExpression',
        object: identifier(COMPONENTS),
        property: identifier(node.name),
        computed: false,
        optional: false,
      },
      consequent: call as unknown as Expression,
      alternate: fallback,
    },
  }
  return container
}

/**
 * 小文字の要素名 (`div` など) を `_components.div` に置き換え、使った要素名を集める。
 */
const routeThroughComponents = (tree: unknown, used: Set<string>): void => {
  if (Array.isArray(tree)) {
    for (const item of tree) routeThroughComponents(item, used)
    return
  }
  if (tree === null || typeof tree !== 'object') return
  const node = tree as { type?: string; name?: { type: string; name: string } }
  if (
    (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') &&
    node.name?.type === 'JSXIdentifier' &&
    /^[a-z]/.test(node.name.name)
  ) {
    used.add(node.name.name)
    node.name = jsxMember(node.name.name) as unknown as { type: string; name: string }
  }
  for (const value of Object.values(tree)) routeThroughComponents(value, used)
}

const exportConst = (name: string, value: Expression): Statement =>
  ({
    type: 'ExportNamedDeclaration',
    declaration: {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [{ type: 'VariableDeclarator', id: identifier(name), init: value }],
    },
    specifiers: [],
    source: null,
    attributes: [],
  }) as unknown as Statement

/** `{ div: 'div', ..., ...props.components }` */
const componentsObject = (used: ReadonlySet<string>): ObjectExpression => ({
  type: 'ObjectExpression',
  properties: [
    ...[...used].sort().map(
      (name): Property => ({
        type: 'Property',
        key: identifier(name),
        value: { type: 'Literal', value: name },
        kind: 'init',
        method: false,
        shorthand: false,
        computed: false,
      }),
    ),
    {
      type: 'SpreadElement',
      argument: {
        type: 'MemberExpression',
        object: identifier('props'),
        property: identifier('components'),
        computed: false,
        optional: false,
      },
    } satisfies SpreadElement,
  ],
})

const contentFunction = (body: Expression, used: ReadonlySet<string>): Statement =>
  ({
    type: 'ExportDefaultDeclaration',
    declaration: {
      type: 'FunctionDeclaration',
      id: identifier('CosenseContent'),
      params: [
        {
          type: 'AssignmentPattern',
          left: identifier('props'),
          right: { type: 'ObjectExpression', properties: [] },
        },
      ],
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'const',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: identifier(COMPONENTS),
                init: componentsObject(used),
              },
            ],
          },
          { type: 'ReturnStatement', argument: body },
        ],
      },
      generator: false,
      async: false,
    },
  }) as unknown as Statement

/** `.csn` / `.csnx` の中身を JS モジュールにする。 */
export const compile = async (
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> => {
  const read = readPage(source, options)
  const warnings: string[] = []
  const hast = toHast(read.page, {
    ...options,
    resolveLink: createLinkResolver(options, warnings),
    ...(read.format === 'csnx'
      ? { components: { source: read.body, lineOffset: read.bodyLineOffset } }
      : {}),
  })

  const tree =
    options.rehypePlugins === undefined || options.rehypePlugins.length === 0
      ? hast
      : ((await unified().use(options.rehypePlugins).run(hast)) as Root)

  const jsxImportSource = options.jsxImportSource ?? 'react'
  const estree = toEstree(tree, {
    elementAttributeNameCase:
      options.elementAttributeNameCase ?? (jsxImportSource === 'react' ? 'react' : 'html'),
    handlers: { cosenseComponent: handleComponent },
  })

  const statement = estree.body[0]
  const body: Expression =
    statement?.type === 'ExpressionStatement'
      ? statement.expression
      : { type: 'Literal', value: null }
  const used = new Set<string>()
  routeThroughComponents(body, used)

  const program: Program = {
    type: 'Program',
    sourceType: 'module',
    body: [
      exportConst('frontmatter', valueToEstree(read.frontmatter) as Expression),
      exportConst('metadata', valueToEstree(read.metadata) as Expression),
      contentFunction(body, used),
    ],
  }
  buildJsx(program, { runtime: 'automatic', importSource: jsxImportSource })

  return {
    code: toJs(program).value,
    format: read.format,
    frontmatter: read.frontmatter,
    metadata: read.metadata,
    warnings,
  }
}
