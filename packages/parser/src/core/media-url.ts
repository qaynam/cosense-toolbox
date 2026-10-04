/**
 * media-url.ts — URL が動画・音声・埋め込みのどれになるかの判定と、埋め込みのプレーヤーの URL。
 *
 * 判定は `[url]` がどのノードになるかを分けるので、記法の構造の一部としてパーサーが持つ。
 * 拡張子の一覧、クエリを許すかどうか、大文字小文字を区別するかは、どれも Cosense Web のパーサーに合わせている。
 * プレーヤーの URL を作るのは表示のための書き換えなので、描画する側が `asEmbedSrc` を呼ぶ。
 */
import { Match, Option, pipe } from "effect"

import type { EmbedNode } from "../types"
import { IMAGE_EXT_RE } from "./image-url"

const VIDEO_RE = /^https?:\/\/[^\s\]]+\.(?:mp4|webm|mov)$/i

/** リンク付き動画 (`[リンク 動画]`) の動画の側だけは、クエリが付いていてもよい。 */
const LINKED_VIDEO_RE = /^https?:\/\/[^\s\]]*\.(?:mp4|webm|mov)(?:\?[^\s\]]+)?$/i

const AUDIO_RE = /^https?:\/\/[^\s\]]*\.(?:wav|mp3|weba|ogg|aac)$/i

/** URL を問わず、ファイルの拡張子から分かるメディアの種類。 */
export type MediaKind = "image" | "video" | "audio"

const KIND_BY_EXTENSION: readonly (readonly [RegExp, MediaKind])[] = [
  [IMAGE_EXT_RE, "image"],
  [/\.(?:mp4|webm|mov)$/i, "video"],
  [/\.(?:wav|mp3|weba|ogg|aac)$/i, "audio"],
]

/** パスの末尾の拡張子から分かるメディアの種類。どれでもなければ None。 */
export const mediaKindOf = (path: string): Option.Option<MediaKind> =>
  Option.fromNullable(KIND_BY_EXTENSION.find(([pattern]) => pattern.test(path))?.[1])

/** 単独で (`[url]` / `[[url]]`) 動画になる URL か。 */
export const isVideoUrl = (url: string): boolean => VIDEO_RE.test(url)

export const isLinkedVideoUrl = (url: string): boolean => LINKED_VIDEO_RE.test(url)

export const isAudioUrl = (url: string): boolean => AUDIO_RE.test(url)

/** 埋め込みのノードのうち、URL から決まる部分。 */
export type EmbedTarget = Pick<EmbedNode, "provider" | "id" | "kind">

const embedWhen =
  (pattern: RegExp, toTarget: (groups: readonly string[]) => EmbedTarget) =>
  (url: string): Option.Option<EmbedTarget> =>
    pipe(
      Option.fromNullable(pattern.exec(url)),
      Option.map((match) => toTarget(match.map((group) => group ?? ""))),
    )

const youtube =
  (kind: string) =>
  ([, id = ""]: readonly string[]): EmbedTarget => ({ provider: "youtube", id, kind })

/**
 * Cosense Web が埋め込む URL。上から順に試す。
 * YouTube だけは大文字小文字を区別する (Cosense Web の規則に `i` が無い)。
 */
const EMBEDS: readonly ((url: string) => Option.Option<EmbedTarget>)[] = [
  embedWhen(
    /^https?:\/\/(?:www\.|music\.|)youtube\.com\/watch\?(?:[^\s\]]+&|)v=([a-zA-Z\d_-]+)(?:&[^\s\]]+|)$/,
    youtube("video"),
  ),
  embedWhen(/^https?:\/\/youtu\.be\/([a-zA-Z\d_-]+)(?:\?[^\s\]]{0,100}|)$/, youtube("video")),
  embedWhen(
    /^https?:\/\/(?:www\.|)youtube\.com\/shorts\/([a-zA-Z\d_-]+)(?:\?[^\s\]]+|)$/,
    youtube("short"),
  ),
  embedWhen(
    /^https?:\/\/(?:www\.|music\.|)youtube\.com\/playlist\?(?:[^\s\]]+&|)list=([a-zA-Z\d_-]+)(?:&[^\s\]]+|)$/,
    youtube("playlist"),
  ),
  embedWhen(
    /^https?:\/\/(?:www\.|)youtube\.com\/live\/([a-zA-Z\d_-]+)(?:\?[^\s\]]+|)$/,
    youtube("live"),
  ),
  embedWhen(/^https?:\/\/vimeo\.com\/([0-9]+)(?:\/[a-z0-9]+)?(?:\?[^\s\]]+|)$/i, ([, id = ""]) => ({
    provider: "vimeo",
    id,
  })),
  embedWhen(
    /^https?:\/\/open\.spotify\.com\/(?:[^/\s]+\/|)(track|artist|playlist|album|episode|show)\/([a-zA-Z\d_-]+)(?:\?\S{0,100}|)$/i,
    ([, kind = "", id = ""]) => ({ provider: "spotify", id, kind }),
  ),
  embedWhen(
    /^https?:\/\/(?:anchor\.fm|podcasters\.spotify\.com\/pod\/show)\/[a-zA-Z\d_-]+\/episodes\/([a-zA-Z\d_-]+(?:\/[a-zA-Z\d_-]+)?)(?:\?\S{0,100}|)$/i,
    ([, id = ""]) => ({ provider: "anchor", id }),
  ),
]

/** URL が埋め込みになるなら、そのサービスと ID。 */
export const embedOf = (url: string): Option.Option<EmbedTarget> =>
  Option.firstSomeOf(EMBEDS.map((embed) => embed(url)))

const queryOf = (url: string): URLSearchParams => new URLSearchParams(url.split("?")[1] ?? "")

const TIME_UNITS: readonly (readonly [RegExp, number])[] = [
  [/(\d+)h/, 3600],
  [/(\d+)m/, 60],
  [/(\d+)s/, 1],
]

/** `t=90` / `t=1m30s` を秒にする。読めなければ開始位置を付けない。 */
const secondsOf = (time: string): Option.Option<number> =>
  pipe(
    /^\d+$/.test(time)
      ? Number(time)
      : TIME_UNITS.reduce(
          (sum, [pattern, unit]) => sum + Number(pattern.exec(time)?.[1] ?? 0) * unit,
          0,
        ),
    Option.liftPredicate((seconds: number) => seconds > 0),
  )

/** 値のある引数だけをクエリにして `base` に付ける。1 つも無ければ `base` のまま。 */
const withQuery = (base: string, params: Readonly<Record<string, Option.Option<string>>>) => {
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]): [string, string][] =>
      Option.match(value, { onNone: () => [], onSome: (text) => [[key, text]] }),
    ),
  ).toString()
  return query === "" ? base : `${base}?${query}`
}

const youtubeSrc = ({ id, kind, url }: EmbedNode): string => {
  const query = queryOf(url)
  return kind === "playlist"
    ? withQuery("https://www.youtube.com/embed/videoseries", { list: Option.some(id) })
    : withQuery(`https://www.youtube.com/embed/${id}`, {
        start: pipe(
          Option.fromNullable(query.get("t")),
          Option.flatMap(secondsOf),
          Option.map(String),
        ),
        list: Option.fromNullable(query.get("list")),
      })
}

/** 限定公開の動画は、URL の 2 段目のハッシュが無いと再生できない。 */
const vimeoSrc = ({ id, url }: EmbedNode): string =>
  withQuery(`https://player.vimeo.com/video/${id}`, {
    h: Option.fromNullable(/vimeo\.com\/\d+\/([a-z0-9]+)/i.exec(url)?.[1]),
  })

const anchorSrc = ({ id, url }: EmbedNode): Option.Option<string> =>
  pipe(
    Option.fromNullable(
      /^https?:\/\/(?:anchor\.fm|podcasters\.spotify\.com\/pod\/show)\/([^/]+)\//i.exec(url)?.[1],
    ),
    Option.map((show) => `https://anchor.fm/${show}/embed/episodes/${id}`),
  )

/**
 * 埋め込みのノードを `<iframe src>` に入れる URL にする。Cosense Web が埋め込むサービスでなければ null。
 *
 * YouTube は `t` (開始位置) と `list` (再生リスト) を引き継ぐ。
 */
export const asEmbedSrc = (node: EmbedNode): string | null =>
  Match.value(node.provider).pipe(
    Match.when("youtube", () => Option.some(youtubeSrc(node))),
    Match.when("vimeo", () => Option.some(vimeoSrc(node))),
    Match.when("spotify", () =>
      Option.some(`https://open.spotify.com/embed/${node.kind ?? ""}/${node.id}`),
    ),
    Match.when("anchor", () => anchorSrc(node)),
    Match.orElse(() => Option.none<string>()),
    Option.getOrNull,
  )
