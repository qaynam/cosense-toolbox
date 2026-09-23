/**
 * extract.ts — `@cosense-toolbox/style` の style.css を、プラグインが組み立て直せるデータにする。
 *
 * スタイルの正は style.css のまま。プラグインのために CSS を手書きし直すと、
 * 2 か所の見た目が少しずつずれていくので、ここで機械的に変換する。
 * 生成スクリプトとテストの両方から呼ぶ (実行時には使わない)。
 */
import { Either } from 'effect'
import postcss, { type ChildNode, type Declaration, type Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'

/** 同じプロパティを 2 回書いた宣言 (fallback など) は配列にする。 */
export type Declarations = Readonly<Record<string, string | readonly string[]>>

export interface StyleSelector {
  /** `.page` を除いたセレクタ。`.line[data-indent]` など */
  readonly body: string
  /** 末尾の擬似要素。`::before` など。無ければ空文字 */
  readonly pseudo: string
}

export interface StyleRule {
  readonly selectors: readonly StyleSelector[]
  readonly declarations: Declarations
}

export interface CosenseStyles {
  /** `.page` 自身に当てる宣言 */
  readonly root: Declarations
  /** `.page` の中の要素に当てるルール。style.css に書かれた順 */
  readonly rules: readonly StyleRule[]
}

const ROOT = '.page'

/** style.css がプラグインに変換できない書き方をしている。 */
export interface ExtractError {
  readonly _tag: 'ExtractError'
  readonly message: string
}

const fail = (message: string): Either.Either<never, ExtractError> =>
  Either.left({ _tag: 'ExtractError', message: `style.css: ${message}` })

/** 同じプロパティは、最初に書いた位置に値をまとめる。2 回目からは配列にする。 */
const declarationsOf = (rule: Rule): Either.Either<Declarations, ExtractError> => {
  const nodes = rule.nodes.filter((node) => node.type !== 'comment')
  const other = nodes.find((node) => node.type !== 'decl')
  if (other !== undefined) {
    return fail(`${rule.selector} の中に宣言以外のもの (${other.type}) がある`)
  }
  const declarations = nodes as Declaration[]
  const cssValue = (decl: Declaration) => (decl.important ? `${decl.value} !important` : decl.value)
  const props = [...new Set(declarations.map((decl) => decl.prop))]
  return Either.right(
    Object.fromEntries(
      props.map((prop) => {
        const values = declarations.filter((decl) => decl.prop === prop).map(cssValue)
        return [prop, values.length === 1 ? (values[0] as string) : values]
      }),
    ),
  )
}

/**
 * `.page .line[data-indent]::before` を `{ body: '.line[data-indent]', pseudo: '::before' }` にする。
 * `.page` だけなら body は空文字。
 */
const splitSelector = (selector: string): Either.Either<StyleSelector, ExtractError> => {
  const nodes = selectorParser().astSync(selector).first.nodes
  const [head, combinator] = nodes
  if (head?.type !== 'class' || `.${head.value}` !== ROOT) {
    return fail(`${selector} が ${ROOT} の下にない`)
  }
  if (nodes.length === 1) return Either.right({ body: '', pseudo: '' })
  // `.page .x` のように子孫として書いたものだけを受け付ける。`.page:hover` や `.page > .x` は
  // プラグインの class を付けた要素との関係が変わってしまうので、変換せずに止める。
  if (combinator?.type !== 'combinator' || combinator.value.trim() !== '') {
    return fail(`${selector} は「${ROOT} の子孫」として書かれていない`)
  }
  const rest = nodes.slice(2)
  const last = rest[rest.length - 1]
  const pseudo = last?.type === 'pseudo' && last.value.startsWith('::') ? last : undefined
  const body = (pseudo === undefined ? rest : rest.slice(0, -1)).map(String).join('').trim()
  return Either.right({ body, pseudo: pseudo === undefined ? '' : pseudo.value })
}

/** トップレベルのルールひとつ。`.page` 自身へのルールか、その中の要素へのルールか。 */
type TopLevelRule =
  | { readonly _tag: 'root'; readonly declarations: Declarations }
  | { readonly _tag: 'rule'; readonly key: string; readonly rule: StyleRule }

const topLevelRuleOf = (node: ChildNode): Either.Either<TopLevelRule, ExtractError> => {
  if (node.type !== 'rule') {
    return fail(`トップレベルに ${node.type} がある。プラグインへの変換を足す必要がある`)
  }
  return Either.gen(function* () {
    const selectors = yield* Either.all(node.selectors.map(splitSelector))
    const declarations = yield* declarationsOf(node)
    const roots = selectors.filter((selector) => selector.body === '').length
    if (roots === 0) {
      const rule: StyleRule = { selectors, declarations }
      return { _tag: 'rule', key: node.selectors.join(','), rule } as const
    }
    if (roots !== selectors.length) return yield* fail(`${ROOT} 自身へのルールは 1 つだけにする`)
    return { _tag: 'root', declarations } as const
  })
}

/** `extractStyles` の、失敗を Either で返す版。 */
export const extractStylesEither = (css: string): Either.Either<CosenseStyles, ExtractError> =>
  Either.flatMap(
    Either.all(
      postcss
        .parse(css)
        .nodes.filter((node) => node.type !== 'comment')
        .map(topLevelRuleOf),
    ),
    (topLevel) => {
      const roots = topLevel.flatMap((node) => (node._tag === 'root' ? [node.declarations] : []))
      const rules = topLevel.flatMap((node) => (node._tag === 'rule' ? [node] : []))
      // プラグインはセレクタを CSS-in-JS のキーにするので、同じセレクタのルールが 2 つあると後が前を消す。
      const keys = rules.map((node) => node.key)
      const duplicate = keys.find((key, i) => keys.indexOf(key) !== i)
      if (duplicate !== undefined) return fail(`${duplicate} のルールが 2 つある。1 つにまとめる`)
      if (roots.length > 1) return fail(`${ROOT} 自身へのルールは 1 つだけにする`)
      return Either.right({ root: roots[0] ?? {}, rules: rules.map((node) => node.rule) })
    },
  )

/**
 * style.css を読む。プラグインに変換できない書き方があれば例外を投げる。
 * 生成スクリプトとテストが呼ぶので、書き方の誤りはそこで止まる。
 */
export const extractStyles = (css: string): CosenseStyles =>
  Either.getOrThrowWith(extractStylesEither(css), (error) => new Error(error.message))
