import { Option } from 'effect'
import { hasImageExtension } from '../image'
import type { BracketRule } from '../types'

/**
 * URL ではなく拡張子だけで画像と分かる中身 (`[a.png]`)。
 *
 * 装飾の中では画像にせずリンク扱いにする (本家準拠)。`[* [a.png]]` の内側は
 * 画像ではなく `a.png` というタイトルの内部リンクになる。
 */
export const imageExtensionRule: BracketRule = (inner, ctx) =>
  ctx.allowDecoration && hasImageExtension(inner)
    ? Option.some({ type: 'image', src: inner })
    : Option.none()
