/**
 * `@cosense-toolbox/tailwind` — `class="cosense"` を付けた要素の中に、Cosense 記法の既定の見た目を当てる。
 * typography の `prose` と同じ使い方をする。
 *
 * ```css
 * @import "tailwindcss";
 * @plugin "@cosense-toolbox/tailwind";
 * ```
 *
 * 当てるスタイルは `@cosense-toolbox/style` の style.css と同じもの (`.page` を `.cosense` に移しただけ)。
 */
import plugin from 'tailwindcss/plugin'
import type { Declarations, StyleRule } from './extract'
import { styles } from './styles.generated'

export interface CosenseTailwindOptions {
  /**
   * スタイルを当てる class 名。`not-{className}` を付けた要素とその中身には当てない。
   *
   * @defaultValue `'cosense'`
   */
  readonly className?: string
}

type CssInJs = { [key: string]: string | readonly string[] | CssInJs }

/**
 * 1 つのルールのセレクタ。`not-cosense` の中を除く条件を、擬似要素より前に付ける。
 *
 * 除く条件は `:where()` に入れて詳細度を増やさない。style.css には、先に書いたルールが
 * 詳細度で後のルールに勝つことを前提にした箇所があるので、元の詳細度の大小をそのまま保つ。
 */
const selectorOf = (rule: StyleRule, className: string): string => {
  const not = `:not(:where([class~="not-${className}"],[class~="not-${className}"] *))`
  return rule.selectors.map(({ body, pseudo }) => `${body}${not}${pseudo}`).join(', ')
}

const componentOf = (className: string): Record<string, CssInJs> => ({
  [`.${className}`]: {
    ...(styles.root as Declarations),
    // 入れ子のキーは `.cosense` の子孫として展開される。
    ...Object.fromEntries(
      styles.rules.map((rule) => [selectorOf(rule, className), rule.declarations]),
    ),
  },
})

/** Tailwind の型を公開する型定義に書き出せるよう、型を明示する。 */
type CosensePlugin = ReturnType<typeof plugin.withOptions<CosenseTailwindOptions>>

const cosense: CosensePlugin = plugin.withOptions<CosenseTailwindOptions>(
  (options) =>
    ({ addComponents }) => {
      // 生成したデータは readonly なので、Tailwind の可変の型に合わせる (中身は書き換えられない)。
      addComponents(
        componentOf(options?.className ?? 'cosense') as Parameters<typeof addComponents>[0],
      )
    },
)

export default cosense
