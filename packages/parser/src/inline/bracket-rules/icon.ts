import { Option } from "effect"

import type { InternalBracketRule } from "../internal-types"

const ICON_RE = /^(.+)\.icon(?:\*(\d+))?$/

const MIN_COUNT = 1
const MAX_COUNT = 20

/** `[user.icon]` と連打 `[user.icon*5]`。個数は 1..20 に収める (描画の暴走を防ぐため)。 */
export const iconRule: InternalBracketRule = (inner) => {
  const match = inner.match(ICON_RE)
  if (!match) return Option.none()

  const raw = match[2]
  const count = raw ? Math.min(Math.max(Number.parseInt(raw, 10), MIN_COUNT), MAX_COUNT) : MIN_COUNT

  return Option.some({ type: "icon", user: match[1] ?? "", count })
}
