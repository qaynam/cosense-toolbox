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

import { compareSpecificity, selectorSpecificity, type Specificity } from './specificity'

/** 同じプロパティを 2 回書いた宣言 (fallback など) は配列にする。 */
export type Declarations = Readonly<Record<string, string | readonly string[]>>

export interface StyleSelector {
  /** `.page` を除いたセレクタ。`.line[data-indent]` など */
  readonly body: string
  /** 末尾の擬似要素。`::before` など。無ければ空文字 */
  readonly pseudo: string
}

/** セレクタを 1 つだけ持つルール。`a, b { … }` と書いたルールはセレクタごとに分ける。 */
export interface StyleRule {
  readonly selector: StyleSelector
  readonly declarations: Declarations
}

export interface CosenseStyles {
  /** `.page` 自身に当てる宣言 */
  readonly root: Declarations
  /**
   * `.page` の中の要素に当てるルール。元の詳細度の低い順で、同じ詳細度なら style.css に書かれた順。
   * プラグインはどのルールも同じ詳細度にするので、この順が勝ち負けを決める。
   */
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
const splitSelector = (
  selector: selectorParser.Selector,
): Either.Either<StyleSelector, ExtractError> => {
  const text = String(selector).trim()
  const nodes = selector.nodes
  const [head, combinator] = nodes
  if (head?.type !== 'class' || `.${head.value}` !== ROOT) {
    return fail(`${text} が ${ROOT} の下にない`)
  }
  if (nodes.length === 1) return Either.right({ body: '', pseudo: '' })
  // `.page .x` のように子孫として書いたものだけを受け付ける。`.page:hover` や `.page > .x` は
  // プラグインの class を付けた要素との関係が変わってしまうので、変換せずに止める。
  if (combinator?.type !== 'combinator' || combinator.value.trim() !== '') {
    return fail(`${text} は「${ROOT} の子孫」として書かれていない`)
  }
  const rest = nodes.slice(2)
  const last = rest[rest.length - 1]
  const pseudo = last?.type === 'pseudo' && last.value.startsWith('::') ? last : undefined
  const body = (pseudo === undefined ? rest : rest.slice(0, -1)).map(String).join('').trim()
  return Either.right({ body, pseudo: pseudo === undefined ? '' : pseudo.value })
}

/** 並べ替える前のルール。元の詳細度を持つ。 */
interface RankedRule extends StyleRule {
  readonly specificity: Specificity
}

/** トップレベルのルールひとつ。`.page` 自身へのルールか、その中の要素へのルールか。 */
type TopLevelRule =
  | { readonly _tag: 'root'; readonly declarations: Declarations }
  | { readonly _tag: 'rules'; readonly rules: readonly RankedRule[] }

const topLevelRuleOf = (node: ChildNode): Either.Either<TopLevelRule, ExtractError> => {
  if (node.type !== 'rule') {
    const what = node.type === 'atrule' ? `@${node.name}` : node.type
    return fail(`トップレベルに ${what} がある。プラグインへの変換を足す必要がある`)
  }
  return Either.gen(function* () {
    const parsed = selectorParser().astSync(node.selector).nodes
    const selectors = yield* Either.all(parsed.map(splitSelector))
    const declarations = yield* declarationsOf(node)
    const roots = selectors.filter((selector) => selector.body === '').length
    if (roots === 0) {
      const rules = selectors.map((selector, i): RankedRule => ({
        selector,
        declarations,
        specificity: selectorSpecificity(parsed[i] as selectorParser.Selector),
      }))
      return { _tag: 'rules', rules } as const
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
      if (roots.length > 1) return fail(`${ROOT} 自身へのルールは 1 つだけにする`)
      // Array.prototype.sort は安定なので、同じ詳細度のルールは書いた順のまま残る。
      const ranked = topLevel
        .flatMap((node) => (node._tag === 'rules' ? node.rules : []))
        .sort((a, b) => compareSpecificity(a.specificity, b.specificity))
      return Either.right({
        root: roots[0] ?? {},
        rules: ranked.map(({ selector, declarations }) => ({ selector, declarations })),
      })
    },
  )

/**
 * style.css を読む。プラグインに変換できない書き方があれば例外を投げる。
 * 生成スクリプトとテストが呼ぶので、書き方の誤りはそこで止まる。
 */
export const extractStyles = (css: string): CosenseStyles =>
  Either.getOrThrowWith(extractStylesEither(css), (error) => new Error(error.message))
