/**
 * specificity.ts — セレクタの詳細度 (Selectors Level 4 の数え方)。
 *
 * プラグインは style.css のルールをすべて `:where()` で包んで詳細度を揃える。
 * そのとき元の詳細度の低い順に並べ直すことで、同じ要素に当たるルールどうしの勝ち負けを保つ。
 * その並べ替えに使う。
 */
import type selectorParser from 'postcss-selector-parser'

/** (id, class・属性・擬似クラス, 要素・擬似要素) */
export type Specificity = readonly [number, number, number]

const ZERO: Specificity = [0, 0, 0]

const add = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** a が b より低ければ負、高ければ正、同じなら 0。 */
export const compareSpecificity = (a: Specificity, b: Specificity): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** 1 つのコロンで書ける、古い書き方の擬似要素。 */
const LEGACY_PSEUDO_ELEMENTS = new Set([':before', ':after', ':first-line', ':first-letter'])

/** 引数のセレクタのうち、一番高い詳細度を数える擬似クラス。 */
const MOST_SPECIFIC_ARGUMENT = new Set([':is', ':not', ':has', ':matches'])

const pseudoSpecificity = (node: selectorParser.Pseudo): Specificity => {
  const name = node.value.toLowerCase()
  if (name.startsWith('::') || LEGACY_PSEUDO_ELEMENTS.has(name)) return [0, 0, 1]
  if (name === ':where') return ZERO
  if (MOST_SPECIFIC_ARGUMENT.has(name)) {
    return node.nodes
      .map(selectorSpecificity)
      .reduce((max, next) => (compareSpecificity(next, max) > 0 ? next : max), ZERO)
  }
  // `:nth-child(2n of S)` の S は数えていない。style.css で使うようになったら足す。
  return [0, 1, 0]
}

const nodeSpecificity = (node: selectorParser.Node): Specificity => {
  switch (node.type) {
    case 'id':
      return [1, 0, 0]
    case 'class':
    case 'attribute':
      return [0, 1, 0]
    case 'tag':
      return [0, 0, 1]
    case 'pseudo':
      return pseudoSpecificity(node)
    default:
      // 結合子・`*`・コメントなどは数えない。
      return ZERO
  }
}

/** 1 つのセレクタ (`,` で区切らないもの) の詳細度。 */
export const selectorSpecificity = (selector: selectorParser.Selector): Specificity =>
  selector.nodes.map(nodeSpecificity).reduce(add, ZERO)
