import { Option } from "effect"

import type { InternalConstruct } from "../internal-types"

/**
 * `open` と `close` の間 (両端を除く) で、インラインコードが始まるか。
 *
 * Cosense Web はインラインコードを括弧より先に読むので、コードが始まる括弧は記法にならない。
 * 行は左から読むので、`open` より前のバッククォートはもう対になり終えている。
 * 間にあるバッククォートの後ろに、行のどこかでもう 1 つあれば、そこからコードが始まる。
 */
export const opensCodeSpan = (source: string, open: number, close: number): boolean => {
  const tick = source.indexOf("`", open + 1)
  return tick >= 0 && tick < close && source.includes("`", tick + 1)
}

/** バッククォートで囲んだインラインコード。閉じるバッククォートが無ければ成立しない。 */
export const inlineCodeConstruct: InternalConstruct = (source, index) => {
  if (source[index] !== "`") return Option.none()

  const end = source.indexOf("`", index + 1)
  if (end < 0) return Option.none()

  return Option.some({
    node: { type: "inlineCode", value: source.slice(index + 1, end) },
    length: end + 1 - index,
  })
}
