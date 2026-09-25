import { Option } from 'effect'

import type { InternalConstruct } from '../internal-types'

const URL_RE = /^https?:\/\/[^\s\]]+/i

/**
 * 角括弧で囲まれていない URL。常に外部リンクになり、画像 URL でも画像にはしない
 * (Cosense Web に合わせている。インライン画像になるのは `[https://.../x.png]` の角括弧つきのみ)。
 */
export const bareUrlConstruct: InternalConstruct = (source, index) => {
  const head = source[index]
  if (head !== 'h' && head !== 'H') return Option.none()

  const match = source.slice(index).match(URL_RE)
  if (!match) return Option.none()

  const url = match[0]
  return Option.some({
    node: { type: 'externalLink', label: url, target: url },
    length: url.length,
  })
}
