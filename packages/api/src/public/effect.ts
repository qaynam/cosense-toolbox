/**
 * `@cosense-toolbox/api/effect`。effect を使う人のために、effect の型のまま出す入口。
 *
 * 呼ぶ関数はどれも、要求を送る `HttpClient` が要る。`HttpClientLive` (globalThis.fetch) か、
 * `httpClientOf(fetch)` で作ったものを渡す。失敗は `CosenseApiError` (`_tag: "CosenseApiError"`)。
 */
export { type CosenseApi, createCosenseApi } from "../api"
export { cosenseIconUrl, isCosenseAssetUrl } from "../assets"
export {
  alignLines,
  type BaseLine,
  buildSegments,
  type ChangedSegment,
  computeChanges,
  createLineId,
  type EditSegment,
  type KeptSegment,
} from "../changes"
export { CosenseApiError, PageConflictError, PageExistsError } from "../errors"
export {
  HttpClient,
  HttpClientError,
  HttpClientLive,
  httpClientOf,
  type HttpClientShape,
} from "../http-client"
export { type MergeConflict, type MergeResult, mergeThreeWay } from "../merge"
export type {
  CosenseApiConfig,
  CosenseApiOptions,
  ListPagesOptions,
  UpdatePageOptions,
} from "../options"
export type * from "../types"
