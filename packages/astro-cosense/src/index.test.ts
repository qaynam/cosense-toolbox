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
 * 開発サーバーを起こしたときの lint を走らせ、終わるまで待つ。
 * 開発中の lint はサーバーを待たせないよう裏で走るので、同じサイトをビルドの lint で
 * 調べ終えるのを待ってから、開発中のほうのログを見る。
 */
const lintOnDevServer = async (root: URL, logger: ReturnType<typeof fakeLogger>) => {
  const integration = cosense({ lint: { unresolvedLinks: "error" } })
  const hooks = integration.hooks as Record<string, (options: object) => unknown>
  const config = { root, srcDir: new URL("src/", root) }
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
