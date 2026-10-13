import { Effect, Option, pipe } from "effect"

import { computeChanges } from "./changes"
import { type CosenseApiError, PageExistsError } from "./errors"
import type { HttpClient } from "./http-client"
import type { PageOperations } from "./page-operations"
import type { CreatePageResult } from "./types"

/** Cosense は、大文字と小文字、空白と `_` だけが違うタイトルを、同じページのものとして扱う。 */
const titleKey = (title: string): string => title.toLowerCase().replace(/ /g, "_")

/** 読み取りと書き込みの関数から `createPage` を作る。 */
export const createPageWith =
  (operations: PageOperations) =>
  (
    project: string,
    lines: readonly string[],
  ): Effect.Effect<CreatePageResult, CosenseApiError | PageExistsError, HttpClient> => {
    const title = lines[0] ?? ""

    // getPage は名前を変えたページを古いタイトルでも引くので、タイトルが同じページだけを、もうあるものとする。
    const failIfExists = <A, E>(
      otherwise: Effect.Effect<A, E, HttpClient>,
    ): Effect.Effect<A, E | CosenseApiError | PageExistsError, HttpClient> =>
      Effect.flatMap(
        operations.getPage(project, title),
        (found): Effect.Effect<A, E | PageExistsError, HttpClient> =>
          pipe(
            found,
            Option.filter((page) => titleKey(page.title) === titleKey(title)),
            Option.match({
              onSome: (page) => Effect.fail(new PageExistsError({ page })),
              onNone: () => otherwise,
            }),
          ),
      )

    const create = pipe(
      operations.previewEdit(project, { changes: computeChanges([], lines) }),
      Effect.flatMap((preview) => operations.submitEdit(project, preview.previewId)),
      Effect.map((submit): CreatePageResult => ({
        commitId: submit.commitId,
        title: pipe(
          Option.fromNullable(submit.page),
          Option.map((page) => page.title),
          Option.filter((written) => written !== ""),
          Option.getOrElse(() => title),
        ),
      })),
      // Cosense は同じタイトルを断らずに番号を付けて作るが、用意してから書くまでのあいだに
      // ほかの人が同じタイトルで作ったときだけは断る。
      Effect.catchIf(
        (error) => error.code === "DuplicateTitle",
        (error) => failIfExists(Effect.fail(error)),
      ),
    )

    return failIfExists(create)
  }
