/**
 * test-helpers.ts — テスト専用 (dist には入らない)。
 *
 * プラグインは `prefix` を、セレクタの文字列に正規表現で付けている。その答え合わせのために、
 * セレクタを構文として読んで接頭辞を付けた style.css を作る。
 */
import postcss from "postcss"
import selectorParser from "postcss-selector-parser"

/**
 * セレクタの class 名すべての前に `prefix` を付ける。宣言の値やコメントには触れない。
 * 装飾の記号ごとの `deco-*` には付けない。toHtml の `classPrefix` も付けないので、それに合わせる。
 */
export const prefixClasses = (css: string, prefix: string): string => {
  const rename = selectorParser((selectors) => {
    selectors.walkClasses((node) => {
      if (!node.value.startsWith("deco-")) node.value = `${prefix}${node.value}`
    })
  })
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    rule.selector = rename.processSync(rule.selector)
  })
  return root.toString()
}
