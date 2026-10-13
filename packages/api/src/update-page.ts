import { Effect, Option, pipe } from "effect"

import { computeChanges } from "./changes"
import { CosenseApiError, PageConflictError } from "./errors"
import type { HttpClient } from "./http-client"
import { type MergeConflict, mergeThreeWay } from "./merge"
import type { UpdatePageOptions } from "./options"
import type { PageOperations } from "./page-operations"
import type { PageDetail, PageToUpdate, SubmitResponse, UpdatePageResult } from "./types"

/** 書くのを何回まで試すか。ほかの人の書き換えが続いても止まるように。 */
const MAX_ATTEMPTS = 3

/**
 * ページが変更を作ったときから動いていて、断られたか。もう無い行への `_update` / `_delete` は 422、
 * もう無い行の前への `_insert` は 500 になる (scrapbox.io で測った)。preview の後にページが動くと、
 * submit は 409 `NotFastForward` になる。
 */
const isStale = (error: CosenseApiError): boolean =>
  error.status === 422 || error.status === 500 || error.code === "NotFastForward"

type TitleChange = NonNullable<SubmitResponse["titleChanged"]>

/** 1 回書いてみた結果。書けなかったときは、断られたエラーがあれば持つ。 */
type Attempt =
  | {
      readonly written: true
      readonly commitId: string
      readonly titleChanged?: TitleChange
    }
  | { readonly written: false; readonly refusal: Option.Option<CosenseApiError> }

/**
 * 書いた後のページの行の文。同じタイトルのページがあると、Cosense はタイトルを変えて (後ろに
 * 番号を付けて) 書くので、1 行目は送った文ではなく、変えた後のタイトルにする。番号を付けることは
 * Cosense の CLI の説明 (`cosense submitEdit --help`) による。
 */
const asWritten = (
  text: readonly string[],
  titleChanged: TitleChange | undefined,
): readonly string[] =>
  pipe(
    Option.fromNullable(titleChanged),
    Option.map((changed) => changed.to),
    Option.filter((title) => title !== ""),
    Option.match({ onNone: () => text, onSome: (title) => [title, ...text.slice(1)] }),
  )

/** 読み取りと書き込みの関数から `updatePage` を作る。 */
export const updatePageWith =
  (operations: PageOperations) =>
  (
    project: string,
    base: PageToUpdate,
    lines: readonly string[],
    options: UpdatePageOptions = {},
  ): Effect.Effect<UpdatePageResult, CosenseApiError | PageConflictError, HttpClient> => {
    const whenConflict = options.whenConflict ?? "error"

    // current のページを text にする。ページが current から動いていたら (preview のコミットが違うか、
    // 動いたせいで断られたら)、書かずに written: false を返す。
    const tryWrite = (
      current: PageToUpdate,
      text: readonly string[],
    ): Effect.Effect<Attempt, CosenseApiError, HttpClient> => {
      const changes = computeChanges(current.lines, text)
      if (changes.length === 0) return Effect.succeed({ written: true, commitId: current.commitId })
      return pipe(
        operations.previewEdit(project, { pageId: current.id, changes }),
        Effect.flatMap((preview) =>
          preview.pagePreview?.commitId === current.commitId
            ? Effect.map(operations.submitEdit(project, preview.previewId), (submit): Attempt => ({
                written: true,
                commitId: submit.commitId,
                ...(submit.titleChanged === undefined ? {} : { titleChanged: submit.titleChanged }),
              }))
            : Effect.succeed<Attempt>({ written: false, refusal: Option.none() }),
        ),
        Effect.catchIf(isStale, (error) =>
          Effect.succeed<Attempt>({ written: false, refusal: Option.some(error) }),
        ),
      )
    }

    // 今のページに、読んだときからの自分の書き換えを合わせる。
    const mergeOnto = (
      latest: PageDetail,
    ): Effect.Effect<
      { readonly text: readonly string[]; readonly overwritten: readonly MergeConflict[] },
      PageConflictError
    > => {
      const { merged, conflicts } = mergeThreeWay(base.lines, lines, latest.lines)
      if (conflicts.length > 0 && whenConflict === "error") {
        return Effect.fail(new PageConflictError({ conflicts, merged, latest }))
      }
      // 合わせた結果には、自分が消した行をほかの人が書き換えたとき、ほかの人の文が残っている。
      // 上書きするなら、それも消す。
      const deleted = new Set(
        conflicts.filter((conflict) => conflict.ours === null).map((conflict) => conflict.line),
      )
      return Effect.succeed({
        text: merged.filter((_, index) => !deleted.has(index)),
        overwritten: conflicts,
      })
    }

    const attempt = (
      current: PageToUpdate,
      text: readonly string[],
      overwritten: readonly MergeConflict[],
      count: number,
    ): Effect.Effect<UpdatePageResult, CosenseApiError | PageConflictError, HttpClient> =>
      Effect.flatMap(tryWrite(current, text), (result) => {
        if (result.written) {
          return Effect.succeed({
            commitId: result.commitId,
            lines: asWritten(text, result.titleChanged),
            overwritten,
            ...(result.titleChanged === undefined ? {} : { titleChanged: result.titleChanged }),
          })
        }
        if (count + 1 >= MAX_ATTEMPTS) {
          return Effect.fail(
            new CosenseApiError({
              status: 409,
              code: "NotFastForward",
              message: `The page kept changing; gave up after ${MAX_ATTEMPTS} attempts`,
            }),
          )
        }
        return Effect.flatMap(
          operations.getPage(project, base.title),
          Option.match({
            onNone: () =>
              Effect.fail(
                new CosenseApiError({ status: 404, message: "The page no longer exists" }),
              ),
            onSome: (latest) =>
              // ページは動いていないのに断られたなら、変更そのものが受け付けられなかった。
              latest.commitId === current.commitId && Option.isSome(result.refusal)
                ? Effect.fail(result.refusal.value)
                : Effect.flatMap(mergeOnto(latest), (next) =>
                    attempt(latest, next.text, next.overwritten, count + 1),
                  ),
          }),
        )
      })

    return attempt(base, lines, [], 0)
  }
