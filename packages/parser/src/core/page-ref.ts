import { Match } from "effect"

import type { Hashtag, IconNode, InternalLink, ProjectLink } from "../types"

/** プロジェクト内のページを指すノード。Cosense Web ではアイコンもユーザーのページへのリンクになる。 */
export type PageRefNode = InternalLink | ProjectLink | Hashtag | IconNode

/**
 * `pageUrl` の既定の実装。`/proj/page` のように区切りを含むタイトルは、
 * 区切りを残したまま各段を encode する。
 */
export const defaultPageUrl = (title: string): string =>
  title.startsWith("/")
    ? title.split("/").map(encodeURIComponent).join("/")
    : `/${encodeURIComponent(title)}`

/** 記法に書かれたページタイトル。ノード型ごとに置き場所が違うのをここで吸収する。 */
export const pageTitleOf = (node: PageRefNode): string =>
  Match.value(node).pipe(
    Match.when({ type: "hashtag" }, (tag) => tag.value),
    Match.when({ type: "icon" }, (icon) => icon.user),
    Match.orElse((link) => link.target),
  )
