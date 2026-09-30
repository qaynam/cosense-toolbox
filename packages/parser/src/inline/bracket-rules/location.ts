import { Option, pipe } from "effect"

import type { InlineNodeInit } from "../../types"
import type { InternalBracketRule } from "../internal-types"

const COORDINATES = String.raw`([NS])(\d+(?:\.\d+)?),([EW])(\d+(?:\.\d+)?)(?:,Z(\d+))?`

const LABEL_AFTER_RE = new RegExp(`^${COORDINATES}(?:\\s+([\\s\\S]+))?$`)
const LABEL_BEFORE_RE = new RegExp(`^([\\s\\S]+?)\\s+${COORDINATES}$`)

const signed = (hemisphere: string, negative: string, degrees: string): number =>
  hemisphere === negative ? -Number(degrees) : Number(degrees)

const locationOf = (
  [ns = "", lat = "", ew = "", lng = "", zoom]: readonly (string | undefined)[],
  label: string | undefined,
): InlineNodeInit => ({
  type: "location",
  latitude: signed(ns, "S", lat),
  longitude: signed(ew, "W", lng),
  ...(zoom === undefined ? {} : { zoom: Number(zoom) }),
  // Cosense Web はラベルの前後の空白を残すが、音声のラベルとそろえて除く。
  ...(label === undefined ? {} : { label: label.trim() }),
})

/**
 * `[N35.68,E139.76]` の地図。ズーム (`,Z14`) と、前か後ろに空白で区切ったラベルを付けられる。
 * 記号は大文字だけで、座標の中に空白は入れられない (Cosense Web と同じ)。
 */
export const locationRule: InternalBracketRule = (inner) =>
  pipe(
    Option.fromNullable(LABEL_AFTER_RE.exec(inner)),
    Option.map(([, ...groups]) => locationOf(groups.slice(0, 5), groups[5])),
    Option.orElse(() =>
      pipe(
        Option.fromNullable(LABEL_BEFORE_RE.exec(inner)),
        Option.map(([, label, ...groups]) => locationOf(groups, label)),
      ),
    ),
  )
