import { Match, Option } from "effect"

/**
 * 文字とアイコンで作る、Cosense のアイコン記法 (`[名前.icon]`) 向けのバッジ。
 * Cosense はアイコンを行の高さに縮めて出すので、高さを固定して横にだけ伸ばす。
 */

/** 背景の形。`plain` は背景を塗らず、文字とアイコンだけを置く。 */
export type BadgeShape = "square" | "rounded" | "pill" | "plain"

export interface Badge {
  readonly text: string
  /** {@link BADGE_FONTS} の `id` */
  readonly font: string
  readonly bold: boolean
  readonly italic: boolean
  /** 文字の前に置くアイコン。Iconify の `prefix:name` (`tabler:check` など) */
  readonly icon: Option.Option<string>
  readonly shape: BadgeShape
  readonly background: string
  /** 文字の色。単色のアイコンもこの色で塗る */
  readonly foreground: string
}

/** 描くときの座標の高さ。書き出すときは {@link BADGE_SIZES} の高さに縮める。 */
export const BADGE_HEIGHT = 128

export const BADGE_FONT_SIZE = Math.round(BADGE_HEIGHT * 0.6)

const ICON_GAP = Math.round(BADGE_HEIGHT * 0.1)

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

/** 背景があるときは背景の内側に収め、無いときは高さいっぱいに近づける。 */
const iconSizeOf = (shape: BadgeShape): number =>
  Math.round(BADGE_HEIGHT * (shape === "plain" ? 0.88 : 0.66))

export interface IconBox {
  /** 左上の位置 */
  readonly x: number
  readonly y: number
  readonly size: number
}

export interface BadgeLayout {
  readonly width: number
  readonly height: number
  /** 背景の角の半径 */
  readonly radius: number
  readonly icon: Option.Option<IconBox>
  /** 文字の左端。縦は `height / 2` を中心に置く */
  readonly textX: number
}

/**
 * `badge` を描く大きさと位置。`textWidth` は文字を {@link BADGE_FONT_SIZE} で描いたときの幅で、
 * フォントによって変わるので描く側が測って渡す。
 */
export const layoutBadge = (badge: Badge, textWidth: number): BadgeLayout => {
  const padding = paddingOf(badge.shape)
  const iconSize = iconSizeOf(badge.shape)
  const hasText = badge.text.length > 0
  const iconSpace = Option.isSome(badge.icon) ? iconSize + (hasText ? ICON_GAP : 0) : 0
  const overhang = badge.italic && hasText ? ITALIC_OVERHANG : 0
  const contentWidth = iconSpace + textWidth + overhang
  const width = Math.max(BADGE_HEIGHT, Math.ceil(padding * 2 + contentWidth))
  // 中身が最小の幅より狭いとき (アイコンだけのとき) は、中身を左右の真ん中に寄せる
  const left = (width - contentWidth) / 2

  return {
    width,
    height: BADGE_HEIGHT,
    radius: radiusOf(badge.shape),
    icon: Option.map(badge.icon, () => ({
      x: left,
      y: (BADGE_HEIGHT - iconSize) / 2,
      size: iconSize,
    })),
    textX: left + iconSpace,
  }
}

export interface BadgeSize {
  readonly id: string
  readonly label: string
  /** 書き出す画像の高さ (px) */
  readonly height: number
  readonly note: string
}

/**
 * 書き出す大きさ。Cosense Web は行の中のアイコンを 1.3em (本文 15px で 19.5px)、
 * `[[名前.icon]]` を 3.9em (58.5px) で出す。高解像度の画面は 2〜3 倍の画素で描くので、
 * それぞれぼやけない高さにしている。
 */
export const BADGE_SIZES: readonly BadgeSize[] = [
  { id: "small", label: "小", height: 48, note: "行の中のアイコン。パソコンの画面なら十分" },
  { id: "medium", label: "中", height: 64, note: "行の中のアイコン。スマートフォンでもくっきり" },
  {
    id: "large",
    label: "大",
    height: 128,
    note: "[[名前.icon]] の大きいアイコンや Slack の絵文字",
  },
]

/** `layout` を `height` の高さに縮めた画像の大きさ。幅は切り上げて、端が欠けないようにする。 */
export const scaledSize = (
  layout: BadgeLayout,
  height: number,
): { readonly width: number; readonly height: number } => ({
  width: Math.ceil((layout.width * height) / layout.height),
  height,
})

export interface BadgeFont {
  readonly id: string
  readonly label: string
  /** Google Fonts のファミリー名 */
  readonly family: string
  /** Google Fonts にある太さ。太字はこの中の一番太いもの */
  readonly weights: readonly number[]
}

/** 選べるフォント。読み込みに時間がかかるので、見た目の違うものを少しだけ置く。 */
export const BADGE_FONTS: readonly BadgeFont[] = [
  { id: "noto-sans-jp", label: "ゴシック", family: "Noto Sans JP", weights: [400, 700] },
  { id: "m-plus-rounded", label: "丸ゴシック", family: "M PLUS Rounded 1c", weights: [400, 700] },
  { id: "zen-maru", label: "やわらか丸", family: "Zen Maru Gothic", weights: [400, 700] },
  { id: "noto-serif-jp", label: "明朝", family: "Noto Serif JP", weights: [400, 700] },
  { id: "dela-gothic", label: "極太", family: "Dela Gothic One", weights: [400] },
  { id: "reggae-one", label: "ポップ", family: "Reggae One", weights: [400] },
  { id: "yusei-magic", label: "手書き", family: "Yusei Magic", weights: [400] },
  { id: "dot-gothic", label: "ドット", family: "DotGothic16", weights: [400] },
]

/** 知らない `id` は最初のフォントにする。 */
export const badgeFontOf = (id: string): BadgeFont =>
  BADGE_FONTS.find((font) => font.id === id) ?? BADGE_FONTS[0]

/** 描く太さ。太い字の無いフォントは太字にしない (太字を選んでも同じ見た目になる)。 */
export const weightOf = (font: BadgeFont, bold: boolean): number =>
  bold ? Math.max(...font.weights) : Math.min(...font.weights)

/** そのフォントのすべての太さを読み込む Google Fonts の CSS の URL。 */
export const googleFontsUrl = (font: BadgeFont): string =>
  `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(" ", "+")}:wght@${font.weights.join(";")}&display=swap`

export interface BadgePreset {
  readonly label: string
  readonly badge: Badge
}

const preset = (label: string, badge: Partial<Badge>): BadgePreset => ({
  label,
  badge: {
    text: "",
    font: BADGE_FONTS[0].id,
    bold: true,
    italic: false,
    icon: Option.none(),
    shape: "plain",
    background: "#ffffff",
    foreground: "#111111",
    ...badge,
  },
})

/** 最初に選べるひな形。ここから文字や色を変えて作る。 */
export const BADGE_PRESETS: readonly BadgePreset[] = [
  preset("文字だけ", { text: "はい、おしまい", shape: "square" }),
  preset("チェック付き", {
    text: "TODO",
    italic: true,
    icon: Option.some("tabler:circle-check-filled"),
    foreground: "#ffffff",
  }),
  preset("チェックだけ", {
    icon: Option.some("tabler:circle-check-filled"),
    foreground: "#2f9bf0",
  }),
  preset("ラベル", { text: "済", shape: "rounded", background: "#1f9d55", foreground: "#ffffff" }),
  preset("注意", {
    text: "注意",
    shape: "pill",
    icon: Option.some("tabler:alert-triangle-filled"),
    background: "#f5a524",
  }),
  preset("絵文字", { text: "工事中", icon: Option.some("twemoji:construction-worker") }),
]
