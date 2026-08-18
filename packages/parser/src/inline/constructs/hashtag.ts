import { Option } from 'effect'
import { isTagBoundary } from '../../core/scan'
import type { InlineConstruct } from '../types'

/** タグ名に使えない文字。空白と角括弧と `#` 自身で終わる。 */
const TAG_NAME_RE = /^[^\s[\]#]+/

/** `#tag`。行頭または空白の直後でだけ成立する (単語の途中の `#` を拾わないため)。 */
export const hashtagConstruct: InlineConstruct = (source, index) => {
  if (source[index] !== '#' || !isTagBoundary(source, index)) return Option.none()

  const match = source.slice(index + 1).match(TAG_NAME_RE)
  if (!match) return Option.none()

  const value = match[0]
  return Option.some({ node: { type: 'hashtag', value }, length: value.length + 1 })
}
