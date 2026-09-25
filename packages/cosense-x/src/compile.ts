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
import { Either, Option, pipe } from 'effect'
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
import type { Root } from 'hast'
import { type Handle, toEstree } from 'hast-util-to-estree'
import { type PluggableList, unified } from 'unified'

import { type CosenseXError, orThrow } from './errors'
import type { Frontmatter } from './frontmatter'
import { type LinkOptions, linkResolution, reportLinks } from './links'
import type { PageMetadata } from './metadata'
import { type Format, type ReadOptions, readPageEither, type ReadResult } from './read'
import { type CosenseComponent, type RenderOptions, toHastEither } from './to-hast'

export interface CompileOptions extends LinkOptions, Omit<ReadOptions, 'filePath'> {
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
  /**
   * 描画の設定。parser の `toHast` のオプションに、cosense-x の `title` を足したもの
   * (`handlers` / `extensions` / `highlight` / `classNames` / `showPads` / `iconImageUrl` / `title`)。
   * パースの設定 (`parseOptions`) と分けて置き、どの段階の設定かを名前で分かるようにしている。
   */
  readonly renderOptions?: RenderOptions
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
 * 小文字の要素名 (`div` など) を `_components.div` に置き換え、使った要素名を返す。
 *
 * estree はその場で書き換える。後段の `buildJsx` も木をその場で書き換える作りなので、
 * `compile` の中で作った木にだけ使う。
 */
const routeThroughComponents = (tree: unknown): ReadonlySet<string> => {
  const used = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (value === null || typeof value !== 'object') return
    const node = value as { type?: string; name?: { type: string; name: string } }
    if (
      (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') &&
      node.name?.type === 'JSXIdentifier' &&
      /^[a-z]/.test(node.name.name)
    ) {
      used.add(node.name.name)
      node.name = jsxMember(node.name.name) as unknown as { type: string; name: string }
    }
    for (const child of Object.values(value)) walk(child)
  }
  walk(tree)
  return used
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
    ...[...used].sort().map((name): Property => ({
      type: 'Property',
      key: identifier(name),
      value: { type: 'Literal', value: name },
      kind: 'init',
      method: false,
      shorthand: false,
      computed: false,
    })),
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

interface Prepared {
  readonly read: ReadResult
  readonly hast: Root
  readonly warnings: readonly string[]
}

/** ファイルを読んで hast にするまで。失敗しうるのはここだけなので、Either で返す。 */
const prepare = (source: string, options: CompileOptions): Either.Either<Prepared, CosenseXError> =>
  Either.flatMap(readPageEither(source, options), (read) => {
    // toHast はリンクと行の途中のタグを見つけるたびに知らせてくるので、ここで受け取って値にする。
    const warnings: string[] = []
    const failures: CosenseXError[] = []
    const warning = (message: string) => {
      warnings.push(message)
    }
    const resolveLink = reportLinks(linkResolution(options), {
      warning,
      failure: (error) => {
        failures.push(error)
      },
    })
    return pipe(
      toHastEither(read.page, {
        ...options.renderOptions,
        resolveLink,
        ...(read.format === 'csnx'
          ? {
              components: {
                source: read.body,
                lineOffset: read.bodyLineOffset,
                onWarning: warning,
                ...(options.parseOptions === undefined
                  ? {}
                  : { parseOptions: options.parseOptions }),
              },
            }
          : {}),
      }),
      Either.flatMap((hast) =>
        Option.match(Option.fromNullable(failures[0]), {
          onNone: () => Either.right({ read, hast, warnings }),
          onSome: Either.left,
        }),
      ),
    )
  })

const runRehype = async (hast: Root, plugins: PluggableList | undefined): Promise<Root> =>
  plugins === undefined || plugins.length === 0
    ? hast
    : ((await unified().use(plugins).run(hast)) as Root)

/** hast から JS のモジュールを作る。 */
const generate = (tree: Root, read: ReadResult, options: CompileOptions): string => {
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
  const used = routeThroughComponents(body)

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
  return toJs(program).value
}

/**
 * `.csn` / `.csnx` の中身を JS モジュールにする。
 * frontmatter が読めない、`.csnx` のタグが対応していない、`unresolved: 'error'` でリンク先が
 * 見つからない、のいずれかなら reject する。
 */
export const compile = async (
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> => {
  const { read, hast, warnings } = orThrow(prepare(source, options))
  const tree = await runRehype(hast, options.rehypePlugins)
  return {
    code: generate(tree, read, options),
    format: read.format,
    frontmatter: read.frontmatter,
    metadata: read.metadata,
    warnings,
  }
}
