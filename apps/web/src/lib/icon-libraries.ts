/**
 * バッジに置けるアイコンの集まり。アイコンの一覧と JSON は Iconify の公開 API から取る
 * (https://iconify.design/docs/api/)。数千あるアイコンをサイトに抱えずに済み、
 * 応答はブラウザに 1 週間キャッシュされる。
 */

import { getIconData, iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils"
import { Option } from "effect"

const API = "https://api.iconify.design"

export interface IconLibrary {
  readonly id: string
  readonly label: string
  /** 選ぶボタンに出す、幅の狭い名前 */
  readonly shortLabel: string
  /** Iconify の prefix。Font Awesome 5 のように、1 つの集まりが複数の prefix に分かれていることがある */
  readonly prefixes: readonly string[]
  /** 絵文字のように色を持つアイコンか。単色のアイコンは文字の色で塗る */
  readonly multicolor: boolean
  /** 一覧の先頭に並べる、よく使うアイコン */
  readonly defaults: readonly string[]
  readonly license: string
  readonly url: string
}

const withPrefix = (prefix: string, names: string): readonly string[] =>
  names.split(" ").map((name) => `${prefix}:${name}`)

export const ICON_LIBRARIES: readonly IconLibrary[] = [
  {
    id: "tabler",
    label: "Tabler Icons",
    shortLabel: "Tabler",
    prefixes: ["tabler"],
    multicolor: false,
    defaults: withPrefix(
      "tabler",
      "circle-check-filled check x alert-triangle-filled info-circle-filled help-circle-filled star-filled heart-filled flame bulb pin-filled flag-filled clock calendar bell-filled lock link bookmark-filled thumb-up-filled mood-smile rocket tool bug sparkles",
    ),
    license: "MIT",
    url: "https://tabler.io/icons",
  },
  {
    id: "font-awesome-5",
    label: "Font Awesome 5 Free",
    shortLabel: "FA 5",
    prefixes: ["fa-solid", "fa-regular"],
    multicolor: false,
    defaults: withPrefix(
      "fa-solid",
      "check-circle check times exclamation-triangle info-circle question-circle star heart fire lightbulb thumbtack flag clock calendar-alt bell lock link bookmark thumbs-up smile rocket tools bug magic",
    ),
    license: "CC BY 4.0",
    url: "https://fontawesome.com/v5/search?m=free",
  },
  {
    id: "twemoji",
    label: "Twemoji",
    shortLabel: "Twemoji",
    prefixes: ["twemoji"],
    multicolor: true,
    defaults: withPrefix(
      "twemoji",
      "check-mark-button cross-mark warning information red-question-mark star red-heart fire light-bulb pushpin triangular-flag alarm-clock calendar bell locked link bookmark thumbs-up grinning-face rocket hammer-and-wrench bug sparkles construction-worker",
    ),
    license: "CC BY 4.0",
    url: "https://github.com/jdecked/twemoji",
  },
]

/** `icon` (`prefix:name`) が入っている集まり。 */
export const libraryOfIcon = (icon: string): IconLibrary | undefined =>
  ICON_LIBRARIES.find((library) => library.prefixes.includes(icon.split(":")[0]))

/** アイコンの JSON。`prefix` ごとに、名前から SVG の中身を引ける */
export type IconSet = Parameters<typeof getIconData>[0]

/**
 * `icons` (`prefix:name`) の JSON を取る URL を、prefix ごとに 1 つずつ。
 * 画像 (`.svg`) を 1 つずつ取るより数が少なく、色を変えても取り直さずに済む。
 */
export const iconSetUrls = (icons: readonly string[]): readonly string[] => {
  const namesByPrefix = new Map<string, string[]>()
  for (const icon of icons) {
    const [prefix, name] = icon.split(":")
    namesByPrefix.set(prefix, [...(namesByPrefix.get(prefix) ?? []), name])
  }
  return [...namesByPrefix].map(
    ([prefix, names]) => `${API}/${prefix}.json?icons=${names.join(",")}`,
  )
}

/**
 * SVG の高さ。既定の `1em` のままだと画像としての大きさが 16px ほどになり、
 * 大きく描くとぼやけることがある。
 */
const SVG_HEIGHT = 128

/**
 * `set` の中の `icon` の SVG。単色のアイコン (`currentColor` で描くもの) は `color` で塗り、
 * 絵文字のように色を持つアイコンはそのままの色にする。`set` に無ければ無い。
 */
export const iconSvg = (set: IconSet, icon: string, color: string): Option.Option<string> =>
  Option.map(Option.fromNullable(getIconData(set, icon.split(":")[1])), (data) => {
    const { attributes, body } = iconToSVG(data, { height: SVG_HEIGHT })
    return iconToHTML(replaceIDs(body), attributes).replaceAll("currentColor", color)
  })

export const svgDataUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`

/** 集まりの中のアイコンの一覧を取る URL。 */
export const collectionUrl = (prefix: string): string => `${API}/collection?prefix=${prefix}`

/** {@link collectionUrl} の応答。アイコンはどれか 1 つの分類か、分類なしに入っている */
export interface Collection {
  readonly prefix: string
  readonly uncategorized?: readonly string[]
  readonly categories?: Readonly<Record<string, readonly string[]>>
}

/** 集まりのすべてのアイコンを `prefix:name` で。同じ名前は 1 度だけ。 */
export const iconsOfCollection = (collection: Collection): readonly string[] => [
  ...new Set(
    [...(collection.uncategorized ?? []), ...Object.values(collection.categories ?? {}).flat()].map(
      (name) => `${collection.prefix}:${name}`,
    ),
  ),
]

/** よく使うアイコンを先に、残りを後ろに並べる。`all` に無いものは並べない。 */
export const withDefaultsFirst = (
  defaults: readonly string[],
  all: readonly string[],
): readonly string[] => {
  const known = new Set(all)
  const first = defaults.filter((icon) => known.has(icon))
  const rest = all.filter((icon) => !first.includes(icon))
  return [...first, ...rest]
}

/** 空白で区切った言葉が、どれもアイコンの名前に入っているか。大文字と小文字は区別しない。 */
export const matchesQuery = (icon: string, query: string): boolean => {
  const name = icon.split(":")[1].toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => name.includes(word))
}
