import { Effect, Option, pipe } from "effect"

import { computeChanges } from "./changes"
import { type CosenseApiError, PageExistsError } from "./errors"
import type { HttpClient } from "./http-client"
import type { PageOperations } from "./page-operations"
import { toTitleLc } from "./title"
import type { CreatePageResult } from "./types"

/** 読み取りと書き込みの関数から `createPage` を作る。 */
export const createPageWith =
  (operations: PageOperations) =>
  (
    lines: readonly string[],
  ): Effect.Effect<CreatePageResult, CosenseApiError | PageExistsError, HttpClient> => {
    const title = lines[0] ?? ""

    // Cosense Web は行の前後の空白を除いてタイトルにし、空になる行は飛ばして次の行をタイトルにする。
    // 1 行目がタイトルにならず、同じタイトルのページがあるかも確かめられないので、何も送らない。
    if (title.trim() === "") {
      return Effect.die(
        new TypeError(
          `the first line is the title and must not be empty or only whitespace: ${JSON.stringify(title)}`,
        ),
      )
    }

    // getPage は名前を変えたページを古いタイトルでも引くので、タイトルが同じページだけを、もうあるものとする。
    const failIfExists = <A, E>(
      otherwise: Effect.Effect<A, E, HttpClient>,
    ): Effect.Effect<A, E | CosenseApiError | PageExistsError, HttpClient> =>
      Effect.flatMap(
        operations.getPage(title),
        (found): Effect.Effect<A, E | PageExistsError, HttpClient> =>
          pipe(
            found,
            Option.filter((page) => toTitleLc(page.title) === toTitleLc(title)),
            Option.match({
              onSome: (page) => Effect.fail(new PageExistsError({ page })),
              onNone: () => otherwise,
            }),
          ),
      )

    const create = pipe(
      operations.previewEdit({ changes: computeChanges([], lines) }),
      Effect.flatMap((preview) => operations.submitEdit(preview.previewId)),
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
