import { Option, pipe } from "effect"

import { isImageUrl } from "../../core/image-url"
import { isAudioUrl } from "../../core/media-url"
import type { InlineNodeInit } from "../../types"
import type { InternalBracketRule } from "../internal-types"

const AUDIO_FIRST_RE = /^(\S+)\s+([\s\S]*)$/
const AUDIO_LAST_RE = /^([\s\S]+)\s+(\S+)$/

/**
 * 相手が画像の URL 1 つなら、音声ではなく音声をリンク先にした画像になる。
 * Cosense Web はリンク付き画像を、ラベル付きの音声より先に試すため。
 */
const isImageLink = (label: string): boolean => /^https?:\/\/\S+$/i.test(label) && isImageUrl(label)

const labelled = (src: string, label: string): Option.Option<InlineNodeInit> =>
  isAudioUrl(src) && !isImageLink(label)
    ? Option.some(label === "" ? { type: "audio", src } : { type: "audio", src, label })
    : Option.none()

const labelledBy = (
  pattern: RegExp,
  inner: string,
  pick: (groups: readonly string[]) => readonly [src: string, label: string],
): Option.Option<InlineNodeInit> =>
  pipe(
    Option.fromNullable(pattern.exec(inner)),
    Option.flatMap((match) => {
      const [src, label] = pick(match.map((group) => group ?? ""))
      return labelled(src, label.trim())
    }),
  )

/**
 * 音声の URL の角括弧。URL だけ (`[音声]`) か、前後に文字を添えたもの (`[音声 ラベル]` / `[ラベル 音声]`)。
 * 画像や動画と違って、添えた文字は外部リンクのラベルではなく音声のラベルになる (Cosense Web と同じ)。
 */
export const audioRule: InternalBracketRule = (inner) =>
  pipe(
    Option.liftPredicate(inner, isAudioUrl),
    Option.map((src): InlineNodeInit => ({ type: "audio", src })),
    Option.orElse(() =>
      labelledBy(AUDIO_FIRST_RE, inner, ([, src = "", label = ""]) => [src, label]),
    ),
    Option.orElse(() =>
      labelledBy(AUDIO_LAST_RE, inner, ([, label = "", src = ""]) => [src, label]),
    ),
  )
