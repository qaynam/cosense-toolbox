import { Option, pipe } from "effect"

import type { LocationNode } from "../types"

/** ラベルで検索するときにズームが無ければ使う縮尺。Cosense Web と同じ値。 */
const SEARCH_ZOOM = 15

/**
 * 地図のノードを Google マップの URL にする。Cosense Web の地図のリンク先と同じ形で、
 * ラベルがあればその名前で検索し、無ければ座標の場所を開く。
 */
export const asMapUrl = ({ latitude, longitude, zoom, label }: LocationNode): string => {
  const at = `${latitude},${longitude}`
  return pipe(
    Option.fromNullable(label),
    Option.match({
      onSome: (name) =>
        `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${at},${zoom ?? SEARCH_ZOOM}z`,
      onNone: () =>
        `https://www.google.com/maps/place/${at}${zoom === undefined ? "" : `/@${at},${zoom}z`}`,
    }),
  )
}
