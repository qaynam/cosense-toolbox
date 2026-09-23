/**
 * extract.ts — `@cosense-toolbox/style` の style.css を、プラグインが組み立て直せるデータにする。
 *
 * スタイルの正は style.css のまま。プラグインのために CSS を手書きし直すと、
 * 2 か所の見た目が少しずつずれていくので、ここで機械的に変換する。
 * 生成スクリプトとテストの両方から呼ぶ (実行時には使わない)。
 */
import postcss, { type Declaration, type Rule } from 'postcss'
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

const declarationsOf = (rule: Rule): Declarations => {
  const out: Record<string, string | string[]> = {}
  rule.each((node) => {
    if (node.type === 'comment') return
    if (node.type !== 'decl') {
      throw new Error(`style.css: ${rule.selector} の中に宣言以外のもの (${node.type}) がある`)
    }
    const decl = node as Declaration
    const value = decl.important ? `${decl.value} !important` : decl.value
    const current = out[decl.prop]
    out[decl.prop] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value]
  })
  return out
}

/**
 * `.page .line[data-indent]::before` を `{ body: '.line[data-indent]', pseudo: '::before' }` にする。
 * `.page` だけなら body は空文字。
 */
const splitSelector = (selector: string): StyleSelector => {
  let result: StyleSelector | undefined
  selectorParser((root) => {
    const nodes = root.first.nodes
    const [head, combinator] = nodes
    if (head?.type !== 'class' || `.${head.value}` !== ROOT) {
      throw new Error(`style.css: ${selector} が ${ROOT} の下にない`)
    }
    if (nodes.length === 1) {
      result = { body: '', pseudo: '' }
      return
    }
    // `.page .x` のように子孫として書いたものだけを受け付ける。`.page:hover` や `.page > .x` は
    // プラグインの class を付けた要素との関係が変わってしまうので、変換せずに止める。
    if (combinator?.type !== 'combinator' || combinator.value.trim() !== '') {
      throw new Error(`style.css: ${selector} は「${ROOT} の子孫」として書かれていない`)
    }
    const rest = nodes.slice(2)
    const last = rest[rest.length - 1]
    const pseudo = last?.type === 'pseudo' && last.value.startsWith('::') ? last : undefined
    const body = (pseudo === undefined ? rest : rest.slice(0, -1)).map(String).join('').trim()
    result = { body, pseudo: pseudo === undefined ? '' : pseudo.value }
  }).processSync(selector)
  if (result === undefined) throw new Error(`style.css: ${selector} を読めない`)
  return result
}

export const extractStyles = (css: string): CosenseStyles => {
  let root: Declarations = {}
  const rules: StyleRule[] = []
  // プラグインはセレクタを CSS-in-JS のキーにするので、同じセレクタのルールが 2 つあると後が前を消す。
  const seen = new Set<string>()

  postcss.parse(css).each((node) => {
    if (node.type === 'comment') return
    if (node.type !== 'rule') {
      throw new Error(
        `style.css: トップレベルに ${node.type} がある。プラグインへの変換を足す必要がある`,
      )
    }
    const selectors = node.selectors.map(splitSelector)
    const declarations = declarationsOf(node)
    const rootCount = selectors.filter((selector) => selector.body === '').length
    if (rootCount === 0) {
      const key = node.selectors.join(',')
      if (seen.has(key)) throw new Error(`style.css: ${key} のルールが 2 つある。1 つにまとめる`)
      seen.add(key)
      rules.push({ selectors, declarations })
      return
    }
    if (rootCount !== selectors.length || Object.keys(root).length > 0) {
      throw new Error(`style.css: ${ROOT} 自身へのルールは 1 つだけにする`)
    }
    root = declarations
  })

  return { root, rules }
}
