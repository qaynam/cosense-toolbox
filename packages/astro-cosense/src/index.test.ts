import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import type { AstroIntegrationLogger } from "astro"
import { describe, expect, it, vi } from "vitest"

import cosense from "./index"

const project = async (files: Record<string, string>): Promise<URL> => {
  const root = await mkdtemp(join(tmpdir(), "cosense-integration-"))
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => {
      await mkdir(dirname(join(root, name)), { recursive: true })
      await writeFile(join(root, name), text, "utf8")
    }),
  )
  return pathToFileURL(`${root}/`)
}

const fakeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

/**
 * 開発サーバーを起こしたときの lint を走らせる。
 * 開発中の lint はサーバーを待たせないよう裏で走り、終わりを待つ手段が無い。そのため、
 * 同じサイトをビルドの lint で調べ終えたことを、開発中のほうも終えた目安にする。
 */
const lintOnDevServer = async (
  root: URL,
  logger: ReturnType<typeof fakeLogger>,
  options: Parameters<typeof cosense>[0] = {},
) => {
  const integration = cosense({ lint: { unresolvedLinks: "error" }, ...options })
  const hooks = integration.hooks as Record<string, (options: object) => unknown>
  const config = { root, srcDir: new URL("src/", root), base: "/" }
  hooks["astro:config:done"]?.({ config, injectTypes: () => {} })
  hooks["astro:server:setup"]?.({
    server: { watcher: { on: () => {} } },
    logger: logger as unknown as AstroIntegrationLogger,
  })
  // リンク切れがあるとビルドの lint は失敗するが、ここでは終わるのを待つためだけに使う。
  await Promise.resolve(hooks["astro:build:start"]?.({ logger: fakeLogger() })).catch(() => {})
}

describe("開発サーバーの lint", () => {
  it("リンク切れが無ければ何も出さない", async () => {
    const root = await project({ "src/content/a.csn": "投稿\n[投稿]" })
    const logger = fakeLogger()
    await lintOnDevServer(root, logger)
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("リンク切れがあれば error として出す", async () => {
    const root = await project({ "src/content/a.csn": "投稿\n[無いページ]" })
    const logger = fakeLogger()
    await lintOnDevServer(root, logger)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1))
  })
})

describe("サイトに置いたメディア ([:/…])", () => {
  it("画像を指す [:/images/a.png] は、リンク切れとして数えない", async () => {
    const root = await project({ "src/content/a.csn": "投稿\n[:/images/a.png] [:/movies/a.mp4]" })
    const logger = fakeLogger()
    await lintOnDevServer(root, logger)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("publicMedia: false なら、Cosense Web と同じくページへのリンクとして読む", async () => {
    const root = await project({ "src/content/a.csn": "投稿\n[:/images/a.png]" })
    const logger = fakeLogger()
    await lintOnDevServer(root, logger, { publicMedia: false })
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1))
  })
})
