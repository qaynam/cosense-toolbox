/**
 * `@cosense-toolbox/tailwind` — `class="cosense"` を付けた要素の中に、Cosense 記法の既定の見た目を当てる。
 * typography の `prose` と同じ使い方をする。
 *
 * ```css
 * @import "tailwindcss";
 * @plugin "@cosense-toolbox/tailwind";
 * ```
 *
 * 当てるスタイルは `@cosense-toolbox/style` の style.css と同じもの。`cosense-link:underline` のような
 * modifier で、記事の中の特定の記法にだけ utility を当てられる。
 */
import plugin, { type PluginAPI } from 'tailwindcss/plugin'
import type { Declarations, StyleRule } from './extract'
import { MODIFIERS, type Modifier } from './modifiers'
import { styles } from './styles.generated'

export interface CosenseTailwindOptions {
  /**
   * スタイルを当てる class 名。`not-{className}` を付けた要素とその中身には当てない。
   *
   * @defaultValue `'cosense'`
   */
  readonly className?: string
}

type Components = Parameters<PluginAPI['addComponents']>[0]

/** 生成したデータは readonly なので、Tailwind の可変の型に合わせる (中身は書き換えない)。 */
const mutable = (declarations: Declarations) => declarations as Record<string, string | string[]>

/**
 * `not-{className}` を付けた要素とその中を除く条件。`:where()` の中なので詳細度を増やさない。
 */
const outside = (className: string): string =>
  `:not(:where([class~="not-${className}"],[class~="not-${className}"] *))`

/**
 * 1 つのルールのセレクタ。本文を `:where()` で包み、どのルールも `.cosense` と同じ詳細度にする。
 * 除く条件は擬似要素より前に付ける。
 *
 * 詳細度を揃えるので、ルールどうしの勝ち負けは並び順だけで決まる。生成したデータは元の詳細度の
 * 低い順に並んでいるので、style.css と同じ勝ち負けになる。後ろに出る `cosense-link:` などの
 * modifier や、同じ詳細度の utility が既定のスタイルに勝てるのは、このため。
 */
const selectorOf = ({ selector }: StyleRule, className: string): string =>
  `& :where(${selector.body})${outside(className)}${selector.pseudo}`

/**
 * ルールごとに別のオブジェクトにする。1 つのオブジェクトのキーにすると、同じセレクタのルールが
 * 後のもので上書きされてしまうため。Tailwind は並べた順のまま `.cosense` の中に出す。
 */
const componentsOf = (className: string): Components => [
  { [`.${className}`]: mutable(styles.root) },
  ...styles.rules.map((rule) => ({
    [`.${className}`]: { [selectorOf(rule, className)]: mutable(rule.declarations) },
  })),
]

/** `cosense-link:` なら `.cosense-link\:underline :is(…)` のように、中の対象だけに当てる。 */
const modifierOf = (modifier: Modifier, className: string): string =>
  `& :is(:where(${modifier.target})${outside(className)})`

/** Tailwind の型を公開する型定義に書き出せるよう、型を明示する。 */
type CosensePlugin = ReturnType<typeof plugin.withOptions<CosenseTailwindOptions>>

const cosense: CosensePlugin = plugin.withOptions<CosenseTailwindOptions>(
  (options) =>
    ({ addComponents, addVariant }) => {
      const className = options?.className ?? 'cosense'
      addComponents(componentsOf(className))
      for (const modifier of MODIFIERS) {
        addVariant(`${className}-${modifier.name}`, modifierOf(modifier, className))
      }
    },
)

export default cosense
