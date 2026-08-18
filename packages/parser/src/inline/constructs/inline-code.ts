import { Option } from 'effect'
import type { InlineConstruct } from '../types'

/** バッククォートで囲んだインラインコード。閉じるバッククォートが無ければ成立しない。 */
export const inlineCodeConstruct: InlineConstruct = (source, index) => {
  if (source[index] !== '`') return Option.none()

  const end = source.indexOf('`', index + 1)
  if (end < 0) return Option.none()

  return Option.some({
    node: { type: 'inlineCode', value: source.slice(index + 1, end) },
    length: end + 1 - index,
  })
}
