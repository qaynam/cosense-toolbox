import { Option } from "effect"

import { type IconSet, iconSetUrls, iconSvg } from "./icon-libraries"

/** 取ってきた JSON を、アイコン (`prefix:name`) ごとに覚えておく。 */
const sets = new Map<string, IconSet>()

/** `icons` のうち、まだ取っていないものの JSON を取る。 */
export const loadIconSets = async (icons: readonly string[]): Promise<void> => {
  const missing = icons.filter((icon) => !sets.has(icon))
  await Promise.all(
    iconSetUrls(missing).map(async (url) => {
      const set = (await (await fetch(url)).json()) as IconSet
      // 別名で頼んだアイコンは aliases に入って返る
      for (const name of [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})]) {
        sets.set(`${set.prefix}:${name}`, set)
      }
    }),
  )
}

/** 取ってあるアイコンの SVG。{@link loadIconSets} で先に取っておく。 */
export const loadedIconSvg = (icon: string, color: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullable(sets.get(icon)), (set) => iconSvg(set, icon, color))
