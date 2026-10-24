import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { httpClientOf } from "./http-client"

describe("httpClientOf", () => {
  it("中断すると、送っている fetch も止める", async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    const neverResponds = ((_input: string, init?: RequestInit) => {
      signals.push(init?.signal)
      return new Promise<Response>(() => undefined)
    }) as typeof globalThis.fetch
    await Effect.runPromise(
      Effect.ignore(
        Effect.timeout(
          httpClientOf(neverResponds).fetch("https://scrapbox.io/api/users/me", {}),
          "10 millis",
        ),
      ),
    )
    expect(signals[0]?.aborted).toBe(true)
  })
})
