/**
 * `@cosense-toolbox/api/effect`。effect を使う人のために、effect の型のまま出す入口。
 *
 * 呼ぶ関数はどれも、要求を送る `HttpClient` を要る。`HttpClientLive` (globalThis.fetch) か、
 * `httpClientOf(fetch)` で作ったものを渡す。失敗は `CosenseApiError` (`_tag: "CosenseApiError"`)。
 */
export { type CosenseApi, createCosenseApi } from "../api"
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
export { CosenseApiError } from "../errors"
export {
  HttpClient,
  HttpClientError,
  HttpClientLive,
  httpClientOf,
  type HttpClientShape,
} from "../http-client"
export type { CosenseApiConfig, ListPagesOptions } from "../options"
export type * from "../types"
