import { Context, Data, Effect, Layer } from "effect"

/** `HttpClient.fetch` が応答を受け取る前に失敗した (通信の失敗や、正しくない URL)。 */
export class HttpClientError extends Data.TaggedError("HttpClientError")<{
  readonly cause: unknown
}> {}

export interface HttpClientShape {
  /**
   * `fetch(input, init)` をして、応答が来る前の失敗 (通信の失敗、正しくない URL など) を
   * `HttpClientError` にする。応答の status は見ない (2xx 以外や 3xx も成功として返す)。
   */
  readonly fetch: (input: string, init: RequestInit) => Effect.Effect<Response, HttpClientError>
}

/** API が要求を送るのに使う。テストや、要求を記録したいときに差し替える。 */
export class HttpClient extends Context.Tag("@cosense-toolbox/api/HttpClient")<
  HttpClient,
  HttpClientShape
>() {}

/** 渡した `fetch` で送る HttpClient。 */
export const httpClientOf = (fetch: typeof globalThis.fetch): HttpClientShape =>
  HttpClient.of({
    fetch: (input, init) =>
      Effect.tryPromise({
        try: () => fetch(input, init),
        catch: (cause) => new HttpClientError({ cause }),
      }),
  })

/** 呼んだときの `globalThis.fetch` で送る HttpClient。 */
export const HttpClientLive: Layer.Layer<HttpClient> = Layer.succeed(
  HttpClient,
  httpClientOf((input, init) => globalThis.fetch(input, init)),
)
