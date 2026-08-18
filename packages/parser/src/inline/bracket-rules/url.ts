import { Option } from 'effect'
import type { InlineNodeInit } from '../../types'
import { imageSrc } from '../image'
import type { BracketRule } from '../types'

const URLS_RE = /https?:\/\/[^\s\]]+/gi

/**
 * 中身に URL を含む角括弧。本家の挙動に合わせて次の順で決める:
 *
 * 1. URL 以外の文字が残る → ラベル付き外部リンク。URL が画像でも文字リンクにする
 *    (`[ラベル https://x/a.png]` は画像にならない)。
 * 2. URL だけが 2 つ以上:
 *    - 画像 URL があれば「リンク付き画像」。画像が複数なら最後を表示し、それ以外の先頭をリンク先にする。
 *    - 画像が無ければ 先頭 = リンク先 / 2 番目 = 表示テキスト。
 * 3. URL が 1 つだけ → 画像なら画像、違えば裸の外部リンク。
 */
export const urlRule: BracketRule = (inner) => {
  const urls = inner.match(URLS_RE) ?? []
  if (urls.length === 0) return Option.none()

  const label = urls.reduce((rest, url) => rest.replace(url, ' '), inner).trim()
  if (label !== '') {
    return Option.some({
      type: 'externalLink',
      label,
      target: urls[0] ?? inner,
    })
  }

  if (urls.length >= 2) {
    const images = urls.filter((url) => Option.isSome(imageSrc(url)))
    const shown = images[images.length - 1]
    if (shown !== undefined) {
      const src = Option.getOrElse(imageSrc(shown), () => shown)
      const link = urls.find((url) => url !== shown) ?? urls[0]
      const node: InlineNodeInit =
        link === undefined ? { type: 'image', src } : { type: 'image', src, link }
      return Option.some(node)
    }
    return Option.some({
      type: 'externalLink',
      label: urls[1] ?? urls[0] ?? '',
      target: urls[0] ?? inner,
    })
  }

  const only = urls[0] ?? inner
  return Option.some(
    Option.match(imageSrc(only), {
      onSome: (src): InlineNodeInit => ({ type: 'image', src }),
      onNone: (): InlineNodeInit => ({ type: 'externalLink', label: only, target: only }),
    }),
  )
}
