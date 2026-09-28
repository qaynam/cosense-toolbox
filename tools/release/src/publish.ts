#!/usr/bin/env bun
/**
 * 公開するすべてのパッケージを、1 回で npm に公開する。
 *
 *   bun run release:publish               公開する
 *   bun run release:publish --dry-run     公開せず、中身だけ確かめる
 *   bun run release:publish --tag next    dist-tag を版から決めず、これにする
 *   bun run release:publish --expect 0.1.0-beta.3
 *                                         揃った版がこれでなければ止める (タグからの公開用)
 *
 * 1. 公開の前に直すこと (problemsOf) があれば止める
 * 2. 公開するパッケージをビルドする
 * 3. 依存されるものから順に、`bun pm pack` で固めて `npm publish` する。
 *    `bun pm pack` が `workspace:*` を実際の版に書き換える (npm publish は書き換えない)。
 *    npm に同じ版があるパッケージは飛ばすので、途中で失敗してもやり直せる。
 */
import { mkdtemp, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { $ } from "bun"
import { Array as Arr, Effect, Option, pipe } from "effect"

import {
  distTagFor,
  type Manifest,
  mismatchedPins,
  problemsOf,
  publishable,
  publishOrder,
  type Workspace,
} from "./release"
import { readWorkspaces } from "./workspaces"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const args = Bun.argv.slice(2)
const dryRun = args.includes("--dry-run")
/** `--name value` の value。 */
const valueOf = (name: string): Option.Option<string> =>
  pipe(
    Arr.findFirstIndex(args, (arg) => arg === name),
    Option.flatMap((index) => Arr.get(args, index + 1)),
  )
const expected = valueOf("--expect")
const tagOverride = valueOf("--tag")

const REGISTRY = "https://registry.npmjs.org"

const run = <A>(label: string, command: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({ try: command, catch: (cause) => new Error(`${label}: ${String(cause)}`) })

/** npm にこの版がもうあるか。 */
const isPublished = ({ manifest }: Workspace) =>
  pipe(
    run("npm view", () =>
      $`npm view ${`${manifest.name}@${manifest.version}`} version --registry ${REGISTRY}`
        .quiet()
        .nothrow(),
    ),
    Effect.map((result) => result.exitCode === 0 && result.stdout.toString().trim() !== ""),
  )

/**
 * npm に出ている版の一覧。まだ 1 つも無いパッケージは空。
 * dist-tag を決めるのに、安定版をもう出したかを知るために使う。
 */
const publishedVersions = ({ manifest }: Workspace) =>
  pipe(
    run("npm view", () =>
      $`npm view ${manifest.name} versions --json --registry ${REGISTRY}`.quiet().nothrow(),
    ),
    Effect.map((result): ReadonlyArray<string> => {
      if (result.exitCode !== 0) return []
      try {
        // 版が 1 つだけのときは配列ではなく文字列で返ってくる。
        const parsed: unknown = JSON.parse(result.stdout.toString())
        return Array.isArray(parsed)
          ? parsed.filter((v): v is string => typeof v === "string")
          : typeof parsed === "string"
            ? [parsed]
            : []
      } catch {
        return []
      }
    }),
  )

/** `bun pm pack` で固めた tarball のパス。`workspace:*` はここで実際の版になる。 */
const pack = ({ dir }: Workspace) =>
  pipe(
    run("mkdtemp", () => mkdtemp(join(tmpdir(), "cosense-release-"))),
    Effect.tap((out) =>
      run(`${dir} を固める`, () =>
        $`bun pm pack --destination ${out}`.cwd(join(root, dir)).quiet(),
      ),
    ),
    Effect.flatMap((out) =>
      pipe(
        run("readdir", () => readdir(out)),
        Effect.flatMap((names) =>
          Effect.mapError(
            Arr.findFirst(names, (name) => name.endsWith(".tgz")),
            () => new Error(`${dir}: tarball ができていない`),
          ),
        ),
        Effect.map((name) => join(out, name)),
      ),
    ),
  )

/**
 * 固めた tarball の package.json で、ほかのパッケージへの依存が公開する版を指しているか。
 * 指していなければ、古い版に依存したパッケージを出してしまうので止める。
 */
const checkPins = (tarball: string, { name, version }: Manifest) =>
  pipe(
    run(`${name} の tarball を読む`, () => $`tar -xOzf ${tarball} package/package.json`.quiet()),
    Effect.map((result): Manifest => JSON.parse(result.stdout.toString()) as Manifest),
    Effect.flatMap((packed) =>
      Arr.match(mismatchedPins(packed, version), {
        onEmpty: () => Effect.void,
        onNonEmpty: (stale) =>
          Effect.fail(
            new Error(
              `${name} が古い版に依存している (${stale.join(", ")})。bun install で lockfile を更新する`,
            ),
          ),
      }),
    ),
  )

const publishOne = (workspace: Workspace) => {
  const { name, version } = workspace.manifest
  return pipe(
    Effect.all([isPublished(workspace), publishedVersions(workspace)]),
    Effect.flatMap(([published, versions]) => {
      if (published) {
        return Effect.sync(() => console.log(`${name}@${version} は公開済みなので飛ばす`))
      }
      const tag = distTagFor(version, versions, tagOverride)
      return pipe(
        pack(workspace),
        Effect.tap((tarball) => checkPins(tarball, workspace.manifest)),
        Effect.tap(() =>
          Effect.sync(() => console.log(`${name}@${version} を dist-tag "${tag}" で公開する`)),
        ),
        Effect.flatMap((tarball) =>
          run(`${name} を公開する`, async () => {
            // npm は 2FA をブラウザか OTP で確かめるが、どちらも端末からの入力を待つ。
            // Bun Shell は子に端末を繋がないので、そのままだと確かめる前に EOTP で諦める。
            // 公開だけは stdio を引き継いで起動し、npm 自身に訊かせる。
            const child = Bun.spawn(
              [
                "npm",
                "publish",
                tarball,
                "--tag",
                tag,
                "--access",
                "public",
                "--registry",
                REGISTRY,
                ...(dryRun ? ["--dry-run"] : []),
              ],
              { stdio: ["inherit", "inherit", "inherit"] },
            )
            const code = await child.exited
            if (code !== 0) throw new Error(`npm publish が ${code} で終わった`)
          }),
        ),
      )
    }),
  )
}

const program = pipe(
  readWorkspaces(root),
  Effect.map((all) => publishOrder(publishable(all))),
  Effect.tap((workspaces) => {
    const problems = [
      ...problemsOf(workspaces),
      ...Option.match(expected, {
        onNone: () => [],
        onSome: (version) =>
          Arr.filterMap(workspaces, ({ manifest }) =>
            manifest.version === version
              ? Option.none()
              : Option.some(
                  `${manifest.name} は ${manifest.version} だが、${version} を公開しようとしている`,
                ),
          ),
      }),
    ]
    return Arr.match(problems, {
      onEmpty: () => Effect.void,
      onNonEmpty: (found) => Effect.fail(new Error(`公開の前に直すこと:\n- ${found.join("\n- ")}`)),
    })
  }),
  // prepublishOnly でもビルドするが、tarball から公開すると走らないので、先にまとめてビルドする。
  // 公開するものだけをビルドする。サイトや examples は公開物に入らない。
  Effect.tap((workspaces) =>
    run("ビルド", () =>
      $`bunx turbo run build ${Arr.map(workspaces, ({ manifest }) => `--filter=${manifest.name}`)}`.cwd(
        root,
      ),
    ),
  ),
  Effect.flatMap(Effect.forEach(publishOne, { discard: true })),
)

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
