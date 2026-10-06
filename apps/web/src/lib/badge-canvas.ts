import { Option } from "effect"

import {
  type Badge,
  BADGE_FONT_SIZE,
  type BadgeFont,
  badgeFontOf,
  type BadgeLayout,
  FALLBACK_FONT,
  fontStackOf,
  googleFontsUrl,
  type IconBox,
  layoutBadge,
  scaledSize,
  weightOf,
} from "./badge"
import { svgDataUrl } from "./icon-libraries"
import { loadedIconSvg, loadIconSets } from "./icon-loader"

/**
 * 斜体の傾き。日本語のフォントの多くは斜体を持たず、canvas は斜体を作ってくれないので、
 * 字を描くときに座標ごと傾ける。
 */
const ITALIC_SLANT = 0.2

const cssFontOf = (badge: Badge): string => {
  const font = badgeFontOf(badge.font)
  return `${weightOf(font, badge.bold)} ${BADGE_FONT_SIZE}px ${fontStackOf(font)}`
}

/** フォントごとに一度だけ Google Fonts の CSS を読む。読み込んだフォントはブラウザがキャッシュする。 */
const stylesheets = new Map<string, Promise<void>>()

const loadStylesheet = (font: BadgeFont): Promise<void> => {
  const cached = stylesheets.get(font.id)
  if (cached) return cached
  const loading = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = googleFontsUrl(font)
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`フォントを読めなかった: ${font.family}`))
    document.head.append(link)
  })
  // 失敗したものは次に選んだときに読み直せるよう、覚えておかない
  loading.catch(() => stylesheets.delete(font.id))
  stylesheets.set(font.id, loading)
  return loading
}

/**
 * `badge` の字を描くのに要るフォントを読み込む。日本語のフォントは字の範囲ごとに分かれているので、
 * 書いてある字の入ったものだけを読む。読み込む前に描くと、別のフォントで測った幅になる。
 */
export const loadBadgeFont = async (badge: Badge): Promise<void> => {
  await Promise.all([loadStylesheet(badgeFontOf(badge.font)), loadStylesheet(FALLBACK_FONT)])
  // 並びのどのフォントも、書いてある字の分を読む (英語のフォントに無い字は代わりのフォントで描く)
  await document.fonts.load(cssFontOf(badge), badge.text || "あ")
}

/**
 * アイコンを `color` で塗った画像。SVG はこのページで作るので、canvas から書き出しても
 * 別のオリジンの画像のように書き出しを止められない。
 */
export const loadIcon = async (icon: string, color: string): Promise<HTMLImageElement> => {
  await loadIconSets([icon])
  const svg = Option.getOrThrow(loadedIconSvg(icon, color))
  const image = new Image()
  image.src = svgDataUrl(svg)
  await image.decode()
  return image
}

/** 縦横の比を保ったまま、`box` の真ん中に収める。 */
const drawIcon = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, box: IconBox): void => {
  const scale = box.size / Math.max(image.naturalWidth, image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(
    image,
    box.x + (box.size - width) / 2,
    box.y + (box.size - height) / 2,
    width,
    height,
  )
}

/** 字の見た目の上下の真ん中を、バッジの高さの真ん中に合わせる。 */
const drawText = (ctx: CanvasRenderingContext2D, badge: Badge, layout: BadgeLayout): void => {
  ctx.font = cssFontOf(badge)
  ctx.fillStyle = badge.foreground
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } = ctx.measureText(
    badge.text,
  )
  ctx.save()
  // 字の並ぶ線を原点にして傾けるので、字の下端の位置は変わらず、上ほど右へずれる
  ctx.translate(layout.textX, layout.height / 2 + (ascent - descent) / 2)
  if (badge.italic) ctx.transform(1, 0, -ITALIC_SLANT, 1, 0, 0)
  ctx.fillText(badge.text, 0, 0)
  ctx.restore()
}

/**
 * `badge` を高さ `height` で `canvas` に描き、canvas の大きさもバッジに合わせる。
 * フォントとアイコンは先に読み込んでおく ({@link loadBadgeFont}, {@link loadIcon})。
 */
export const drawBadge = (
  canvas: HTMLCanvasElement,
  badge: Badge,
  height: number,
  icon: Option.Option<HTMLImageElement>,
): void => {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.font = cssFontOf(badge)
  const layout = layoutBadge(badge, ctx.measureText(badge.text).width)
  const size = scaledSize(layout, height)
  // 大きさを変えると canvas の中身と設定が消えるので、測ったあとに変える
  canvas.width = size.width
  canvas.height = size.height
  ctx.scale(size.height / layout.height, size.height / layout.height)

  if (badge.shape !== "plain") {
    ctx.fillStyle = badge.background
    ctx.beginPath()
    ctx.roundRect(0, 0, layout.width, layout.height, layout.radius)
    ctx.fill()
  }
  const iconToDraw = Option.zipWith(layout.icon, icon, (box, image) => ({ box, image }))
  if (Option.isSome(iconToDraw)) drawIcon(ctx, iconToDraw.value.image, iconToDraw.value.box)
  drawText(ctx, badge, layout)
}
