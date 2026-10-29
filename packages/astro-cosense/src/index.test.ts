import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { AstroIntegrationLogger } from "astro"
import { afterEach, describe, expect, it, vi } from "vitest"

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

/** 統合が読む Astro の設定。省いたものは Astro の既定値にする。 */
interface FakeAstroConfig {
  readonly srcDir?: string
  readonly base?: string
  readonly trailingSlash?: "always" | "never" | "ignore"
  readonly format?: "directory" | "file" | "preserve"
}

/** `astro:config:setup` を走らせ、統合が足した vite プラグインで `.csn` を変換したコードを返す。 */
const transformWithIntegration = async (
  root: URL,
  source: string,
  options: Parameters<typeof cosense>[0] = {},
  config: FakeAstroConfig = {},
): Promise<string> => {
  const integration = cosense({ assets: false, syntaxHighlight: false, ...options })
  const hooks = integration.hooks as Record<string, (options: object) => unknown>
  const plugins: {
    transform: { handler: (code: string, id: string) => Promise<{ code: string }> }
  }[] = []
  hooks["astro:config:setup"]?.({
    config: {
      root,
      srcDir: new URL(config.srcDir ?? "src/", root),
      base: config.base ?? "/",
      trailingSlash: config.trailingSlash ?? "ignore",
      build: { format: config.format ?? "directory" },
      markdown: {},
    },
    addRenderer: () => {},
    addPageExtension: () => {},
    addContentEntryType: () => {},
    updateConfig: (config: { vite: { plugins: typeof plugins } }) =>
      plugins.push(...config.vite.plugins),
    logger: fakeLogger(),
  })
  const [plugin] = plugins
  const context = { warn: () => {}, environment: { name: "ssr" } }
  const result = await plugin?.transform.handler.call(
    context,
    source,
    fileURLToPath(new URL("src/content/a.csn", root)),
  )
  return result?.code ?? ""
}

describe("Gyazo の動画 (gyazoVideo)", () => {
  const hash = "0123456789abcdef0123456789abcdef"
  const source = `投稿\n[https://gyazo.com/${hash}]`

  /** どの hash にも「動画」と答える oEmbed。呼ばれた URL を記録する。 */
  const stubVideoOembed = () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      calls.push(String(input))
      return Response.json({ type: "video" })
    })
    return calls
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("既定では oEmbed に聞かず、/raw の画像 (動画なら gif) のまま出す", async () => {
    const calls = stubVideoOembed()
    const root = await project({ "src/content/a.csn": source })
    const code = await transformWithIntegration(root, source)
    expect(calls).toEqual([])
    expect(code).toContain(`https://gyazo.com/${hash}/raw`)
  })

  it("gyazoVideo: 'video' なら、動画と分かった Gyazo を mp4 の動画で出す", async () => {
    stubVideoOembed()
    const root = await project({ "src/content/a.csn": source })
    const code = await transformWithIntegration(root, source, { gyazoVideo: "video" })
    expect(code).toContain(`https://i.gyazo.com/${hash}.mp4`)
  })

  it("差し替えた動画にも、renderOptions の classNames を使う", async () => {
    stubVideoOembed()
    const root = await project({ "src/content/a.csn": source })
    const code = await transformWithIntegration(root, source, {
      gyazoVideo: "video",
      renderOptions: { classNames: { video: "my-video" } },
    })
    expect(code).toContain("my-video")
  })
})

describe("pageUrl を渡さないときのリンク先", () => {
  const PAGES = {
    "src/pages/index.csnx": "トップ",
    "src/pages/a/index.csnx": "A",
    "src/pages/a/b.csnx": "B",
    "src/pages/a b.csnx": "空白",
    "src/content/post.csn": "post",
  }

  /** PAGES を置いたサイトで、`source` を変換したコード。 */
  const transformInSite = async (
    source: string,
    config: FakeAstroConfig = {},
    options: Parameters<typeof cosense>[0] = {},
  ): Promise<string> => transformWithIntegration(await project(PAGES), source, options, config)

  it("src/pages のページへは、Astro がそのファイルを出す URL にする", async () => {
    expect(await transformInSite("投稿\n[B]")).toContain('href: "/a/b/"')
  })

  it("src/pages の index へは、そのディレクトリの URL にする", async () => {
    expect(await transformInSite("投稿\n[A]")).toContain('href: "/a/"')
  })

  it("src/pages/index へは、サイトの根元にする", async () => {
    expect(await transformInSite("投稿\n[トップ]")).toContain('href: "/"')
  })

  it("ファイル名は URL に使える形に encode する", async () => {
    expect(await transformInSite("投稿\n[空白]")).toContain('href: "/a%20b/"')
  })

  it("src/pages の外のページ (content collection など) へは /{slug} にする", async () => {
    expect(await transformInSite("投稿\n[post]")).toContain('href: "/post"')
  })

  it("src の外のページ (glob の base を ./content にした content collection など) へも /{slug} にする", async () => {
    const root = await project({ "content/posts/post.csn": "post" })
    expect(await transformWithIntegration(root, "投稿\n[post]")).toContain('href: "/post"')
  })

  it("src/pages のページへの URL の前に base を付ける", async () => {
    expect(await transformInSite("投稿\n[B]", { base: "/docs" })).toContain('href: "/docs/a/b/"')
  })

  it("src/pages/index へは base の URL にする", async () => {
    expect(await transformInSite("投稿\n[トップ]", { base: "/docs" })).toContain('href: "/docs/"')
  })

  it("src/pages の外のページへの URL の前にも base を付ける", async () => {
    expect(await transformInSite("投稿\n[post]", { base: "/docs" })).toContain('href: "/docs/post"')
  })

  it("サイトに無いページへのリンク (unresolvedLinks: 'link') にも base を付ける", async () => {
    expect(
      await transformInSite("投稿\n[none]", { base: "/docs" }, { unresolvedLinks: "link" }),
    ).toContain('href: "/docs/none"')
  })

  it("base の末尾の / を重ねない", async () => {
    expect(await transformInSite("投稿\n[B]", { base: "/docs/" })).toContain('href: "/docs/a/b/"')
  })

  it("trailingSlash が 'never' なら、末尾に / を付けない", async () => {
    expect(await transformInSite("投稿\n[B]", { trailingSlash: "never" })).toContain('href: "/a/b"')
  })

  it("build.format が 'file' なら、末尾に / を付けない", async () => {
    expect(await transformInSite("投稿\n[B]", { format: "file" })).toContain('href: "/a/b"')
  })

  it("末尾に / を付けないときも、src/pages/index へはサイトの根元にする", async () => {
    expect(await transformInSite("投稿\n[トップ]", { trailingSlash: "never" })).toContain(
      'href: "/"',
    )
  })

  it("trailingSlash が 'always' なら、build.format が 'file' でも末尾に / を付ける", async () => {
    expect(
      await transformInSite("投稿\n[B]", { trailingSlash: "always", format: "file" }),
    ).toContain('href: "/a/b/"')
  })

  it("srcDir を変えたら、その下の pages のページをファイルの場所で引く", async () => {
    const root = await project({ "source/pages/a/b.csnx": "B" })
    const code = await transformWithIntegration(root, "投稿\n[B]", {}, { srcDir: "source/" })
    expect(code).toContain('href: "/a/b/"')
  })

  it("pageUrl を渡せば、それが返した URL を base を付けずに使う", async () => {
    const pageUrl = (page: { readonly slug: string }) => `/p/${page.slug}`
    expect(await transformInSite("投稿\n[B]", { base: "/docs" }, { pageUrl })).toContain(
      'href: "/p/B"',
    )
  })
})
