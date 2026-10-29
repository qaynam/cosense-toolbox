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
import plugin, { type PluginAPI } from "tailwindcss/plugin"

import type { Declarations, StyleRule } from "./extract"
import { type Modifier, MODIFIERS } from "./modifiers"
import { styles } from "./styles.generated"

export interface CosenseTailwindOptions {
  /**
   * スタイルを当てる class 名。`not-{className}` を付けた要素とその中身には当てない。
   *
   * @defaultValue `'cosense'`
   */
  readonly className?: string
  /**
   * parser の `toHtml` に渡した `classPrefix`。既定のスタイルと modifier が選ぶ class 名の前に付ける。
   * `toHtml` と同じ値を渡す。
   *
   * @defaultValue `''` (付けない)
   */
  readonly prefix?: string
}

type Components = Parameters<PluginAPI["addComponents"]>[0]

/** 生成したデータは readonly なので、Tailwind の可変の型に合わせる (中身は書き換えない)。 */
const mutable = (declarations: Declarations) => declarations as Record<string, string | string[]>

/**
 * `not-{className}` を付けた要素とその中を除く条件。`:where()` の中なので詳細度を増やさない。
 */
const outside = (className: string): string =>
  `:not(:where([class~="not-${className}"],[class~="not-${className}"] *))`

/**
 * セレクタの class 名の前に `prefix` を付ける。
 * style.css と modifier のセレクタは、属性の値に `.` を書かず、`deco-*` も選ばない。
 * そのため `.` で始まる語をすべて class とみなしてよい。style.css のルールについては、セレクタを構文として
 * 読んで接頭辞を付けたものと同じになることを、テストで確かめている。
 */
const withPrefix = (selector: string, prefix: string): string =>
  selector.replace(/\.(-?[A-Za-z_][\w-]*)/g, (_, name: string) => `.${prefix}${name}`)

/**
 * 1 つのルールのセレクタ。本文を `:where()` で包み、どのルールも `.cosense` と同じ詳細度にする。
 * 除く条件は擬似要素より前に付ける。
 *
 * 詳細度を揃えるので、ルールどうしの勝ち負けは並び順だけで決まる。生成したデータは元の詳細度の
 * 低い順に並んでいるので、style.css と同じ勝ち負けになる。後ろに出る `cosense-link:` などの
 * modifier や、同じ詳細度の utility が既定のスタイルに勝てるのは、このため。
 */
const selectorOf = ({ selector }: StyleRule, className: string, prefix: string): string =>
  `& :where(${withPrefix(selector.body, prefix)})${outside(className)}${selector.pseudo}`

/**
 * ルールごとに別のオブジェクトにする。1 つのオブジェクトのキーにすると、同じセレクタのルールが
 * 後のもので上書きされてしまうため。Tailwind は並べた順のまま `.cosense` の中に出す。
 */
const componentsOf = (className: string, prefix: string): Components => [
  { [`.${className}`]: mutable(styles.root) },
  ...styles.rules.map((rule) => ({
    [`.${className}`]: { [selectorOf(rule, className, prefix)]: mutable(rule.declarations) },
  })),
]

/** `cosense-link:` なら `.cosense-link\:underline :is(…)` のように、中の対象だけに当てる。 */
const modifierOf = (modifier: Modifier, className: string, prefix: string): string =>
  `& :is(:where(${withPrefix(modifier.target, prefix)})${outside(className)})`

/** class 名に使えない記号を、CSS のセレクタ用にエスケープする。 */
const escapeClassChar = (char: string): string => (/[A-Za-z0-9_-]/.test(char) ? char : `\\${char}`)

/**
 * `cosense-deco-[|]:` の `[...]` に書いた記号の装飾。`toHtml` は装飾を
 * `<span class="deco deco-|">` のように記号ごとの class で出すので、それを選ぶ。
 * 記号を並べると (`[-/]`)、それらをすべて持つ装飾に当たる。
 *
 * Tailwind は `[...]` の中の `_` を空白に変える。下線の記号 `_` は `[\_]` と書く (Tailwind の決まり)。
 */
const decorationOf = (markers: string, className: string, prefix: string): string => {
  const classes = [...new Set(markers)].map((marker) => `.deco-${escapeClassChar(marker)}`).join("")
  return `& :is(:where(.${prefix}deco${classes})${outside(className)})`
}

/** Tailwind の型を公開する型定義に書き出せるよう、型を明示する。 */
type CosensePlugin = ReturnType<typeof plugin.withOptions<CosenseTailwindOptions>>

const cosense: CosensePlugin = plugin.withOptions<CosenseTailwindOptions>(
  (options) =>
    ({ addComponents, addVariant, matchVariant }) => {
      const className = options?.className ?? "cosense"
      const prefix = options?.prefix ?? ""
      addComponents(componentsOf(className, prefix))
      for (const modifier of MODIFIERS) {
        addVariant(`${className}-${modifier.name}`, modifierOf(modifier, className, prefix))
      }
      // 記号は `[...]` にそのまま書く (`cosense-deco-[|]:`)。名前を覚えなくて済むようにするため。
      matchVariant(`${className}-deco`, (markers) => decorationOf(markers, className, prefix))
    },
)

export default cosense
