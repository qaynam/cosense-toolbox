import { readdir } from "node:fs/promises"
import { sep } from "node:path"

import { type AnyNode, normalizeLineEndings } from "@cosense-toolbox/parser"
import { type MediaKind, mediaKindOfPath } from "@cosense-toolbox/parser/extensions"
import { Array as Arr, Effect, Match, Option, pipe } from "effect"
import {
  type CompletionItem,
  CompletionItemKind,
  type Diagnostic,
} from "vscode-languageserver/node"

import { bodyNodes, type BodyOptions } from "./body"
import type { CompletionDetection } from "./completion"
import { lspSeverity, type Severity } from "./diagnostics"

/**
 * Files a site serves, written `[:/images/a.png]` (the parser's `publicMedia`): which ones
 * there are, completing them, and pointing out one that is not there.
 *
 * Paths are site paths: `/images/a.png` for `<mediaRoot>/images/a.png`.
 */

/**
 * The images, videos and sounds under `root`, as site paths. A directory that cannot be read
 * holds none, rather than failing the server.
 */
export const mediaFilesIn = (root: string): Effect.Effect<ReadonlyArray<string>> =>
  pipe(
    Effect.tryPromise(() => readdir(root, { recursive: true })),
    Effect.map((paths) =>
      Arr.filterMap(paths, (path) =>
        mediaKindOfPath(path) === null
          ? Option.none()
          : Option.some(`/${path.split(sep).join("/")}`),
      ),
    ),
    Effect.orElseSucceed(() => []),
  )

/** What is typed after `:` in `[:/images]`: the start of a site path. */
const SITE_PATH = /^:(\/\S*)$/

const KIND_NAMES: Readonly<Record<MediaKind, string>> = {
  image: "画像",
  video: "動画",
  audio: "音声",
}

const kindNameOf = (path: string): string =>
  Match.value(mediaKindOfPath(path)).pipe(
    Match.when(null, () => ""),
    Match.orElse((kind) => KIND_NAMES[kind]),
  )

/**
 * The files `detection` could be completing, when it is a bracket opened with `:/`: every
 * file whose site path holds what is typed, in path order. None for any other bracket.
 */
export const mediaCompletionItems = (
  files: ReadonlyArray<string>,
  detection: CompletionDetection,
  line: number,
): CompletionItem[] =>
  pipe(
    Option.liftPredicate(detection, ({ kind }) => kind === "link"),
    Option.flatMap(({ query }) => Option.fromNullable(SITE_PATH.exec(query)?.[1])),
    Option.match({
      onNone: () => [],
      onSome: (typed) =>
        pipe(
          Arr.filter(files, (file) => file.includes(typed)),
          Arr.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
          Arr.map((file): CompletionItem => {
            const notation = `[:${file}]`
            return {
              label: file,
              kind: CompletionItemKind.File,
              detail: kindNameOf(file),
              // The whole bracket is replaced, as for a link: the reader typed the `[`.
              textEdit: {
                range: {
                  start: { line, character: detection.replaceStart },
                  end: { line, character: detection.replaceEnd },
                },
                newText: notation,
              },
              filterText: notation,
              sortText: file,
            }
          }),
        ),
    }),
  )

/** An image, video or sound, and the path it points at. */
const mediaOf = (node: AnyNode): Option.Option<{ readonly node: AnyNode; readonly src: string }> =>
  node.type === "image" || node.type === "video" || node.type === "audio"
    ? Option.some({ node, src: node.src })
    : Option.none()

/** Written `[:/…]` or `[[:/…]]`, not by URL: only those are files of this site. */
const isSitePath = (lineText: string, column: number): boolean =>
  /^\[\[?:\//.test(lineText.slice(column))

export interface MissingMediaOptions extends BodyOptions {
  readonly severity: Severity
}

/** A diagnostic for each `[:/…]` in `text` whose file is not among `files`. */
export const missingMediaDiagnostics = (
  text: string,
  files: ReadonlySet<string>,
  options: MissingMediaOptions,
): Diagnostic[] => {
  const lines = normalizeLineEndings(text).split("\n")
  return pipe(
    lspSeverity(options.severity),
    Option.match({
      onNone: () => [],
      onSome: (severity) =>
        pipe(
          bodyNodes(text, mediaOf, options),
          Arr.filter(({ node: { node }, line }) =>
            isSitePath(lines[line] ?? "", node.position.start.column),
          ),
          Arr.filter(({ node: { src } }) => !files.has(src)),
          Arr.map(({ node: { node, src }, line }): Diagnostic => ({
            range: {
              start: { line, character: node.position.start.column },
              end: { line, character: node.position.end.column },
            },
            severity,
            source: "cosense",
            code: "missing-media",
            message: `ファイルが見つからない: ${src}`,
          })),
        ),
    }),
  )
}
