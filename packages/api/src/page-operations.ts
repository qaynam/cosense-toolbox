import type { Effect, Option } from "effect"

import type { CosenseApiError } from "./errors"
import type { HttpClient } from "./http-client"
import type { PageDetail, PreviewEditBody, PreviewResponse, SubmitResponse } from "./types"

/** ページを作ったり書き換えたりするのに使う、1 つのプロジェクトの中の読み取りと書き込み。 */
export interface PageOperations {
  readonly getPage: (
    title: string,
  ) => Effect.Effect<Option.Option<PageDetail>, CosenseApiError, HttpClient>
  readonly previewEdit: (
    body: PreviewEditBody,
  ) => Effect.Effect<PreviewResponse, CosenseApiError, HttpClient>
  readonly submitEdit: (
    previewId: string,
  ) => Effect.Effect<SubmitResponse, CosenseApiError, HttpClient>
}
