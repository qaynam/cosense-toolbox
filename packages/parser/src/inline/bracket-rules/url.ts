import { Option, pipe } from 'effect'
import { isImageUrl } from '../../core/image-url'
import type { InlineNodeInit } from '../../types'
import type { BracketRule } from '../types'

const URLS_RE = /https?:\/\/[^\s\]]+/gi

/** 画像 URL が複数あるとき最後のものを採るのは本家の挙動。 */
const lastImage = (urls: readonly string[]): Option.Option<string> => {
  const images = urls.filter(isImageUrl)
  return Option.fromNullable(images[images.length - 1])
}

/** 画像に添える遷移先。画像自身とは別の URL を優先し、無ければ先頭を使う。 */
const linkFor = (urls: readonly string[], src: string): Option.Option<string> =>
  Option.fromNullable(urls.find((url) => url !== src) ?? urls[0])

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
    return Option.some(
      pipe(
        lastImage(urls),
        Option.match({
          onSome: (src): InlineNodeInit =>
            pipe(
              linkFor(urls, src),
              Option.match({
                onNone: (): InlineNodeInit => ({ type: 'image', src }),
                onSome: (link): InlineNodeInit => ({ type: 'image', src, link }),
              }),
            ),
          onNone: (): InlineNodeInit => ({
            type: 'externalLink',
            label: urls[1] ?? urls[0] ?? '',
            target: urls[0] ?? inner,
          }),
        }),
      ),
    )
  }

  const only = urls[0] ?? inner
  return Option.some(
    pipe(
      Option.liftPredicate(only, isImageUrl),
      Option.match({
        onSome: (src): InlineNodeInit => ({ type: 'image', src }),
        onNone: (): InlineNodeInit => ({ type: 'externalLink', label: only, target: only }),
      }),
    ),
  )
}
