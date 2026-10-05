import { Match, Option } from "effect"

import {
  type Badge,
  BADGE_FONT_SIZE,
  type BadgeLayout,
  type BadgeMark,
  layoutBadge,
  type MarkCircle,
} from "./badge"

const FONT_FAMILY = `"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`

const TEXT_FONT = `700 ${BADGE_FONT_SIZE}px ${FONT_FAMILY}`

/**
 * 斜体の傾き。日本語の字体の多くは斜体を持たず、canvas は斜体を作ってくれないので、
 * 字を描くときに座標ごと傾ける。
 */
const ITALIC_SLANT = 0.2

/**
 * 記号の線や字を描く。丸の上に重ねるので、丸が抜けて見える色で描く。
 * 背景の無いバッジでは塗る色が無いので、丸を透明に切り抜く。
 */
const drawMarkGlyph = (
  ctx: CanvasRenderingContext2D,
  mark: Exclude<BadgeMark, "none">,
  { x, y, radius }: MarkCircle,
): void =>
  Match.value(mark).pipe(
    Match.when("check", () => {
      ctx.lineWidth = radius * 0.3
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.beginPath()
      ctx.moveTo(x - radius * 0.45, y + radius * 0.02)
      ctx.lineTo(x - radius * 0.12, y + radius * 0.34)
      ctx.lineTo(x + radius * 0.46, y - radius * 0.3)
      ctx.stroke()
    }),
    Match.orElse((glyphMark) => {
      ctx.font = `900 ${Math.round(radius * 1.45)}px ${FONT_FAMILY}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(glyphMark === "exclamation" ? "!" : "?", x, y + radius * 0.06)
    }),
  )

const drawMark = (ctx: CanvasRenderingContext2D, badge: Badge, circle: MarkCircle): void => {
  if (badge.mark === "none") return
  ctx.fillStyle = badge.foreground
  ctx.beginPath()
  ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  if (badge.shape === "plain") ctx.globalCompositeOperation = "destination-out"
  ctx.fillStyle = badge.background
  ctx.strokeStyle = badge.background
  drawMarkGlyph(ctx, badge.mark, circle)
  ctx.restore()
}

/** 字の見た目の上下の真ん中を、バッジの高さの真ん中に合わせる。 */
const drawText = (ctx: CanvasRenderingContext2D, badge: Badge, layout: BadgeLayout): void => {
  ctx.font = TEXT_FONT
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

/** `badge` を `canvas` に描き、canvas の大きさもバッジに合わせる。 */
export const drawBadge = (canvas: HTMLCanvasElement, badge: Badge): void => {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  ctx.font = TEXT_FONT
  const layout = layoutBadge(badge, ctx.measureText(badge.text).width)
  // 大きさを変えると canvas の中身と設定が消えるので、測ったあとに変える
  canvas.width = layout.width
  canvas.height = layout.height

  if (badge.shape !== "plain") {
    ctx.fillStyle = badge.background
    ctx.beginPath()
    ctx.roundRect(0, 0, layout.width, layout.height, layout.radius)
    ctx.fill()
  }
  if (Option.isSome(layout.mark)) drawMark(ctx, badge, layout.mark.value)
  drawText(ctx, badge, layout)
}

/** 描くのに使う字体を読み込んでおく。読み込む前に描くと、別の字体で測った幅になる。 */
export const loadBadgeFonts = (badge: Badge): Promise<unknown> =>
  document.fonts.load(TEXT_FONT, badge.text || "あ")
