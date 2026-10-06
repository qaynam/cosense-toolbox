import { Option } from "effect"

import {
  type Collection,
  collectionUrl,
  type IconLibrary,
  type IconSet,
  iconSetUrls,
  iconsOfCollection,
  iconSvg,
  withDefaultsFirst,
} from "./icon-libraries"

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

const libraries = new Map<string, Promise<readonly string[]>>()

/** 集まりのすべてのアイコン。よく使うものが先に来る。集まりごとに一度だけ取る。 */
export const loadLibraryIcons = (library: IconLibrary): Promise<readonly string[]> => {
  const cached = libraries.get(library.id)
  if (cached) return cached
  const loading = Promise.all(
    library.prefixes.map(async (prefix) =>
      iconsOfCollection((await (await fetch(collectionUrl(prefix))).json()) as Collection),
    ),
  ).then((lists) => withDefaultsFirst(library.defaults, lists.flat()))
  // 失敗したものは次に選んだときに取り直せるよう、覚えておかない
  loading.catch(() => libraries.delete(library.id))
  libraries.set(library.id, loading)
  return loading
}
