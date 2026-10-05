import { Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  distTagFor,
  isStable,
  isVersion,
  type Manifest,
  type MergedPullRequest,
  mismatchedPins,
  problemsOf,
  publishable,
  publishOrder,
  releasePullRequestProblems,
  versionOfBranch,
  withLockVersion,
  withVersion,
  type Workspace,
} from "./release"

/** Fields to change, or to take away by giving `undefined`. */
type Overrides = { readonly [K in keyof Manifest]?: Manifest[K] | undefined }

/** A package that has everything publishing needs. Tests take one thing away at a time. */
const ready = (dir: string, overrides: Overrides = {}): Workspace => {
  const manifest = {
    name: `@cosense-toolbox/${dir.split("/").at(-1)}`,
    version: "0.1.0-beta.2",
    files: ["dist", "README.md", "LICENSE"],
    repository: {
      type: "git",
      url: "git+https://github.com/qaynam/cosense-toolbox.git",
      directory: dir,
    },
    publishConfig: { access: "public" },
    scripts: { build: "tsdown", prepublishOnly: "bun run build" },
    ...overrides,
  }
  // A field given as undefined is left out, as a package.json without it would be.
  const present = Object.fromEntries(
    Object.entries(manifest).filter(([, value]) => value !== undefined),
  ) as unknown as Manifest
  return { dir, hasLicense: true, manifest: present }
}

describe("publishable", () => {
  it("packages/ の下の、private でないパッケージだけを公開する", () => {
    const found = publishable([
      ready("packages/parser"),
      ready("packages/internal", { private: true }),
      ready("apps/web"),
    ])
    expect(found.map((w) => w.dir)).toEqual(["packages/parser"])
  })
})

describe("publishOrder", () => {
  it("依存されるパッケージを、依存するパッケージより先に公開する", () => {
    const order = publishOrder([
      ready("packages/astro", {
        dependencies: {
          "@cosense-toolbox/cosense-x": "workspace:*",
          "@cosense-toolbox/lsp": "workspace:*",
        },
      }),
      ready("packages/lsp", { dependencies: { "@cosense-toolbox/parser": "workspace:*" } }),
      ready("packages/cosense-x", { dependencies: { "@cosense-toolbox/parser": "workspace:*" } }),
      ready("packages/parser"),
    ])
    expect(order.map((w) => w.dir)).toEqual([
      "packages/parser",
      "packages/lsp",
      "packages/cosense-x",
      "packages/astro",
    ])
  })

  it("開発用の依存は順番に関係しない", () => {
    const order = publishOrder([
      ready("packages/textmate", { devDependencies: { "@cosense-toolbox/lsp": "workspace:*" } }),
      ready("packages/lsp"),
    ])
    expect(order.map((w) => w.dir)).toEqual(["packages/textmate", "packages/lsp"])
  })
})

describe("problemsOf", () => {
  it("公開に必要なものが揃っていれば、何も言わない", () => {
    expect(problemsOf([ready("packages/parser"), ready("packages/style")])).toEqual([])
  })

  it("バージョンが揃っていなければ、それぞれのバージョンを挙げる", () => {
    expect(
      problemsOf([ready("packages/parser", { version: "0.1.0-beta.1" }), ready("packages/style")]),
    ).toEqual([
      "バージョンが揃っていない: @cosense-toolbox/parser 0.1.0-beta.1, @cosense-toolbox/style 0.1.0-beta.2",
    ])
  })

  it("ほかのパッケージへの依存は workspace:* で書く", () => {
    expect(
      problemsOf([
        ready("packages/cosense-x", { dependencies: { "@cosense-toolbox/parser": "^0.1.0" } }),
        ready("packages/parser"),
      ]),
    ).toEqual(["@cosense-toolbox/cosense-x: @cosense-toolbox/parser は workspace:* にする"])
  })

  it("npm に公開する設定 (access) がなければ止める", () => {
    expect(problemsOf([ready("packages/lsp", { publishConfig: undefined })])).toEqual([
      '@cosense-toolbox/lsp: publishConfig に access: "public" が無い',
    ])
  })

  it("publishConfig.tag が書いてあれば止める", () => {
    // 書いたままだと v1 が latest にならず、消すとベータが安定バージョンを latest から押しのける。
    expect(
      problemsOf([ready("packages/lsp", { publishConfig: { access: "public", tag: "beta" } })]),
    ).toEqual([
      "@cosense-toolbox/lsp: publishConfig.tag は書かない (dist-tag はバージョンから決める)",
    ])
  })

  it("repository.directory がパッケージの場所を指していなければ止める", () => {
    expect(problemsOf([ready("packages/lsp", { repository: undefined })])).toEqual([
      "@cosense-toolbox/lsp: repository.directory が packages/lsp を指していない",
    ])
  })

  it("LICENSE のファイルが無いか、files に入っていなければ止める", () => {
    expect(problemsOf([{ ...ready("packages/lsp"), hasLicense: false }])).toEqual([
      "@cosense-toolbox/lsp: LICENSE が無いか、files に入っていない",
    ])
    expect(problemsOf([ready("packages/lsp", { files: ["dist", "README.md"] })])).toEqual([
      "@cosense-toolbox/lsp: LICENSE が無いか、files に入っていない",
    ])
  })

  it("ビルドするパッケージは、公開の前にビルドする (prepublishOnly)", () => {
    expect(problemsOf([ready("packages/lsp", { scripts: { build: "tsdown" } })])).toEqual([
      "@cosense-toolbox/lsp: build があるのに prepublishOnly でビルドしていない",
    ])
  })

  it("ビルドしないパッケージには prepublishOnly は要らない", () => {
    expect(problemsOf([ready("packages/style", { scripts: {} })])).toEqual([])
  })
})

describe("isVersion", () => {
  it("semver のバージョンと、pre-release 付きのバージョンを受け付ける", () => {
    expect(isVersion("1.2.3")).toBe(true)
    expect(isVersion("0.1.0-beta.2")).toBe(true)
  })

  it("バージョンでないものは受け付けない", () => {
    expect(isVersion("v0.1.0")).toBe(false)
    expect(isVersion("0.1")).toBe(false)
    expect(isVersion("1.2.3.4")).toBe(false)
  })
})

describe("withVersion", () => {
  it("version の値だけを書き換え、ほかの書き方はそのまま残す", () => {
    const text = '{\n  "name": "x",\n  "version": "0.1.0-beta.0",\n  "bin": { "x": "./x" }\n}\n'
    expect(withVersion(text, "0.1.0-beta.2")).toBe(
      '{\n  "name": "x",\n  "version": "0.1.0-beta.2",\n  "bin": { "x": "./x" }\n}\n',
    )
  })

  it("依存の中の version という名前には触れない", () => {
    const text = '{\n  "version": "1.0.0",\n  "dependencies": { "version": "2.0.0" }\n}\n'
    expect(withVersion(text, "1.1.0")).toBe(
      '{\n  "version": "1.1.0",\n  "dependencies": { "version": "2.0.0" }\n}\n',
    )
  })
})

describe("mismatchedPins", () => {
  it("固めたあとの依存が、公開するバージョンと同じなら何も言わない", () => {
    const packed = ready("packages/astro", {
      dependencies: { "@cosense-toolbox/parser": "0.1.0-beta.2", unified: "^11.0.0" },
    }).manifest
    expect(mismatchedPins(packed, "0.1.0-beta.2")).toEqual([])
  })

  it("古いバージョンを指していれば、その依存を挙げる (lockfile が更新されていない)", () => {
    const packed = ready("packages/astro", {
      dependencies: {
        "@cosense-toolbox/parser": "0.1.0-beta.1",
        "@cosense-toolbox/lsp": "0.1.0-beta.2",
      },
    }).manifest
    expect(mismatchedPins(packed, "0.1.0-beta.2")).toEqual(["@cosense-toolbox/parser 0.1.0-beta.1"])
  })
})

describe("withLockVersion", () => {
  const lock = [
    "{",
    '  "workspaces": {',
    '    "packages/parser": {',
    '      "name": "@cosense-toolbox/parser",',
    '      "version": "0.1.0-beta.1",',
    "    },",
    '    "packages/style": {',
    '      "name": "@cosense-toolbox/style",',
    '      "version": "0.1.0-beta.0",',
    "    },",
    "  },",
    "}",
  ].join("\n")

  it("そのワークスペースのバージョンだけを書き換える", () => {
    const written = withLockVersion(lock, "packages/parser", "0.1.0-beta.2")
    expect(written).toContain('"name": "@cosense-toolbox/parser",\n      "version": "0.1.0-beta.2"')
    expect(written).toContain('"name": "@cosense-toolbox/style",\n      "version": "0.1.0-beta.0"')
  })

  it("lockfile に無いワークスペースなら、何も変えない", () => {
    expect(withLockVersion(lock, "packages/lsp", "0.1.0-beta.2")).toBe(lock)
  })
})

describe("isStable", () => {
  it("pre-release の無いバージョンだけを安定バージョンとみなす", () => {
    expect(isStable("1.0.0")).toBe(true)
    expect(isStable("1.0.0+build.5")).toBe(true)
    expect(isStable("1.0.0-beta.1")).toBe(false)
    expect(isStable("0.1.0-beta.2")).toBe(false)
    expect(isStable("v1.0.0")).toBe(false)
  })
})

describe("distTagFor", () => {
  const none = Option.none<string>()

  it("安定バージョンをまだ出していないうちは、プレリリースも latest にする", () => {
    // 守る安定バージョンが無いので、分けると latest だけが古いバージョンを指し続ける。
    expect(distTagFor("0.1.0-beta.3", [], none)).toBe("latest")
    expect(distTagFor("0.1.0-beta.3", ["0.1.0-beta.1", "0.1.0-beta.2"], none)).toBe("latest")
  })

  it("安定バージョンは、package.json に何も書かなくても latest になる", () => {
    expect(distTagFor("1.0.0", ["0.1.0-beta.2"], none)).toBe("latest")
    expect(distTagFor("1.1.0", ["1.0.0"], none)).toBe("latest")
  })

  it("安定バージョンを出した後のプレリリースは、latest を押しのけず識別子のタグに入る", () => {
    expect(distTagFor("1.1.0-beta.1", ["1.0.0"], none)).toBe("beta")
    expect(distTagFor("2.0.0-rc.1", ["1.0.0", "1.1.0-beta.1"], none)).toBe("rc")
  })

  it("名前の無い識別子 (数字だけ) は next にする", () => {
    expect(distTagFor("1.1.0-0", ["1.0.0"], none)).toBe("next")
  })

  it("--tag で渡したタグが何より優先される", () => {
    expect(distTagFor("0.1.0-beta.3", [], Option.some("next"))).toBe("next")
    expect(distTagFor("1.0.0", ["1.0.0-rc.1"], Option.some("beta"))).toBe("beta")
  })
})

describe("versionOfBranch", () => {
  it("リリースのブランチの名前からバージョンを読む", () => {
    expect(Option.getOrNull(versionOfBranch("release/v0.1.0-beta.9"))).toBe("0.1.0-beta.9")
  })

  it("リリースのブランチでなければバージョンは無い", () => {
    expect(Option.isNone(versionOfBranch("feat/media"))).toBe(true)
  })
})

describe("releasePullRequestProblems", () => {
  const merged = (
    number: number,
    contained: boolean,
    head = `feat/${number}`,
  ): MergedPullRequest => ({
    number,
    title: `PR ${number}`,
    baseRefName: "main",
    headRefName: head,
    contained,
  })
  /** バージョンの大小。テストでは pre-release の番号だけを比べれば足りる。 */
  const order = (a: string, b: string) => Number(a.split(".").at(-1)) - Number(b.split(".").at(-1))
  const ok = {
    base: "main",
    branch: "release/v0.1.0-beta.2",
    workspaces: [ready("packages/parser"), ready("packages/lsp")],
    merged: [merged(1, true)],
    npmVersions: ["0.1.0-beta.0", "0.1.0-beta.1"],
    order,
  }

  it("main に向け、バージョンが揃い、マージした PR がすべて入っていれば、何も言わない", () => {
    expect(releasePullRequestProblems(ok)).toEqual([])
  })

  it("main 以外に向けたリリースの PR は止める", () => {
    expect(releasePullRequestProblems({ ...ok, base: "fix/zed-styles-to-main" })).toEqual([
      "リリースの PR は main に向ける (今は fix/zed-styles-to-main)",
    ])
  })

  it("ブランチのバージョンとパッケージのバージョンが違えば止める", () => {
    expect(releasePullRequestProblems({ ...ok, branch: "release/v0.1.0-beta.3" })).toEqual([
      "ブランチのバージョン 0.1.0-beta.3 と、パッケージのバージョン 0.1.0-beta.2 が違う",
    ])
  })

  it("マージしたのにリリースに入っていない PR を挙げる", () => {
    const pr = { ...merged(45, false), baseRefName: "feat/zed-publish" }
    expect(releasePullRequestProblems({ ...ok, merged: [pr] })).toEqual([
      "#45「PR 45」がリリースに入っていない (マージ先: feat/zed-publish)",
    ])
  })

  it("npm にもうあるバージョンは止める", () => {
    expect(
      releasePullRequestProblems({ ...ok, npmVersions: ["0.1.0-beta.1", "0.1.0-beta.2"] }),
    ).toEqual(["0.1.0-beta.2 は npm にもう出ている"])
  })

  it("npm の一番新しいバージョンより古いバージョンは止める", () => {
    expect(releasePullRequestProblems({ ...ok, npmVersions: ["0.1.0-beta.5"] })).toEqual([
      "0.1.0-beta.2 は npm の一番新しいバージョン 0.1.0-beta.5 より古い",
    ])
  })

  it("前のリリースの PR は、後のリリースが置き換えるので数えない", () => {
    const old = merged(50, false, "release/v0.1.0-beta.1")
    expect(releasePullRequestProblems({ ...ok, merged: [old] })).toEqual([])
  })
})
