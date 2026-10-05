import { Match, Option } from "effect"

/**
 * 文字と記号だけで作る、Cosense のアイコン記法 (`[名前.icon]`) 向けのバッジ。
 * Cosense はアイコンを行の高さに縮めて出すので、高さを固定して横にだけ伸ばす。
 */

/** 背景の形。`plain` は背景を塗らず、文字と記号だけを置く。 */
export type BadgeShape = "square" | "rounded" | "pill" | "plain"

/** 文字の前に置く、丸に白抜きの記号。 */
export type BadgeMark = "none" | "check" | "exclamation" | "question"

export interface Badge {
  readonly text: string
  readonly shape: BadgeShape
  readonly mark: BadgeMark
  /** 背景の色。`plain` では記号の白抜きにだけ使う */
  readonly background: string
  /** 文字と記号の丸の色 */
  readonly foreground: string
  readonly italic: boolean
}

/** 書き出す画像の高さ (px)。行の高さに縮めても、高解像度の画面でぼやけない大きさ。 */
export const BADGE_HEIGHT = 128

export const BADGE_FONT_SIZE = Math.round(BADGE_HEIGHT * 0.6)

const MARK_RADIUS = Math.round(BADGE_HEIGHT * 0.36)
const MARK_GAP = Math.round(BADGE_HEIGHT * 0.12)

/** 斜体の文字は右上へ傾くので、その分を右に足しておかないと最後の文字が欠ける。 */
const ITALIC_OVERHANG = Math.round(BADGE_FONT_SIZE * 0.2)

const paddingOf = (shape: BadgeShape): number =>
  Match.value(shape).pipe(
    Match.when("plain", () => 4),
    // 丸は角が削れる分、文字を内側に寄せないと端が欠けて見える
    Match.when("pill", () => Math.round(BADGE_HEIGHT * 0.34)),
    Match.orElse(() => Math.round(BADGE_HEIGHT * 0.22)),
  )

const radiusOf = (shape: BadgeShape): number =>
  Match.value(shape).pipe(
    Match.when("pill", () => BADGE_HEIGHT / 2),
    Match.when("rounded", () => Math.round(BADGE_HEIGHT * 0.2)),
    Match.orElse(() => 0),
  )

export interface MarkCircle {
  readonly x: number
  readonly y: number
  readonly radius: number
}

export interface BadgeLayout {
  readonly width: number
  readonly height: number
  /** 背景の角の半径 */
  readonly radius: number
  readonly mark: Option.Option<MarkCircle>
  /** 文字の左端。縦は `height / 2` を中心に置く */
  readonly textX: number
}

/**
 * `badge` を描く大きさと位置。`textWidth` は文字を {@link BADGE_FONT_SIZE} で描いたときの幅で、
 * フォントによって変わるので描く側が測って渡す。
 */
export const layoutBadge = (badge: Badge, textWidth: number): BadgeLayout => {
  const padding = paddingOf(badge.shape)
  const hasMark = badge.mark !== "none"
  const hasText = badge.text.length > 0
  const markSpace = hasMark ? MARK_RADIUS * 2 + (hasText ? MARK_GAP : 0) : 0
  const overhang = badge.italic && hasText ? ITALIC_OVERHANG : 0
  const width = Math.max(BADGE_HEIGHT, Math.ceil(padding * 2 + markSpace + textWidth + overhang))
  // 中身が最小の幅より狭いとき (記号だけのとき) は、中身を左右の真ん中に寄せる
  const left = (width - (markSpace + textWidth + overhang)) / 2

  return {
    width,
    height: BADGE_HEIGHT,
    radius: radiusOf(badge.shape),
    mark: Option.liftPredicate(
      { x: left + MARK_RADIUS, y: BADGE_HEIGHT / 2, radius: MARK_RADIUS },
      () => hasMark,
    ),
    textX: left + markSpace,
  }
}

export interface BadgePreset {
  readonly label: string
  readonly badge: Badge
}

/** 最初に選べるひな形。ここから文字や色を変えて作る。 */
export const BADGE_PRESETS: readonly BadgePreset[] = [
  {
    label: "文字だけ",
    badge: {
      text: "はい、おしまい",
      shape: "square",
      mark: "none",
      background: "#ffffff",
      foreground: "#111111",
      italic: false,
    },
  },
  {
    label: "チェック付き",
    badge: {
      text: "TODO",
      shape: "plain",
      mark: "check",
      background: "#ffffff",
      foreground: "#ffffff",
      italic: true,
    },
  },
  {
    label: "チェックだけ",
    badge: {
      text: "",
      shape: "plain",
      mark: "check",
      background: "#ffffff",
      foreground: "#2f9bf0",
      italic: false,
    },
  },
  {
    label: "ラベル",
    badge: {
      text: "済",
      shape: "rounded",
      mark: "none",
      background: "#1f9d55",
      foreground: "#ffffff",
      italic: false,
    },
  },
  {
    label: "注意",
    badge: {
      text: "注意",
      shape: "pill",
      mark: "exclamation",
      background: "#f5a524",
      foreground: "#111111",
      italic: false,
    },
  },
]
