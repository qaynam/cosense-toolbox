import { Option } from 'effect'
import { shiftOrigin } from '../../core/position'
import type { InlineNodeInit } from '../../types'
import { imageSrc } from '../image'
import type { InlineConstruct } from '../types'

/**
 * `[[...]]` — 本家の strong。`]]` で閉じるときだけ成立する
 * (深さは数えない。`[[a] b]` のようなケースは bracketConstruct 側で処理される)。
 *
 * 中身が画像 URL なら大きい画像、そうでなければ太字装飾になる。
 */
export const strongBracketConstruct: InlineConstruct = (source, index, ctx) => {
  if (source[index] !== '[' || source[index + 1] !== '[') return Option.none()

  const end = source.indexOf(']]', index + 2)
  if (end < 0) return Option.none()

  const inner = source.slice(index + 2, end)
  const length = end + 2 - index

  const image = imageSrc(inner)
  if (Option.isSome(image)) {
    const node: InlineNodeInit = { type: 'image', src: image.value, large: true }
    return Option.some({ node, length })
  }

  return Option.some({
    node: {
      type: 'decoration',
      value: inner,
      bold: true,
      italic: false,
      strike: false,
      underline: false,
      sizeLevel: 0,
      children: ctx.tokenize(inner, shiftOrigin(ctx.origin, index + 2), false),
    },
    length,
  })
}
