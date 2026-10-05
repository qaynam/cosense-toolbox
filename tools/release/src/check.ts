#!/usr/bin/env bun
/**
 * リリースの PR を、マージする前に確かめる (CI の release-check から動かす)。
 *
 *   bun run release:check --base main --branch release/v0.1.0-beta.9
 *
 * main に向いているか、ブランチとパッケージのバージョンが揃っているか、そのバージョンを npm に出せるか、
 * 前のリリースの後にマージした PR がすべて入っているかを見る (releasePullRequestProblems)。
 * 入っているかは、いまのコミット (CI では PR を main にマージした形) から辿れるかで決める。
 */
import { fileURLToPath } from "node:url"

import { $ } from "bun"
import { Array as Arr, Effect, Option, pipe } from "effect"

import {
  type MergedPullRequest,
  publishable,
  releasePullRequestProblems,
  versionOfBranch,
} from "./release"
import { readWorkspaces } from "./workspaces"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const args = Bun.argv.slice(2)
const valueOf = (name: string): string =>
  pipe(
    Arr.findFirstIndex(args, (arg) => arg === name),
    Option.flatMap((index) => Arr.get(args, index + 1)),
    Option.getOrElse(() => ""),
  )
const base = valueOf("--base")
const branch = valueOf("--branch")

const REGISTRY = "https://registry.npmjs.org"

const run = <A>(label: string, command: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({ try: command, catch: (cause) => new Error(`${label}: ${String(cause)}`) })

const text = (label: string, command: () => Promise<{ stdout: Buffer; exitCode: number }>) =>
  Effect.map(run(label, command), (result) =>
    result.exitCode === 0 ? result.stdout.toString().trim() : "",
  )

/** 前のリリースのタグが付いた日時。これから出すバージョンのタグ (付け直す前のもの) は除く。 */
const previousReleaseDate = pipe(
  versionOfBranch(branch),
  Option.match({ onNone: () => "", onSome: (version) => `v${version}` }),
  (current) =>
    text("git describe", () =>
      $`git describe --tags --abbrev=0 --match ${"v*"} --exclude ${current || "-"} HEAD`
        .cwd(root)
        .quiet()
        .nothrow(),
    ),
  Effect.flatMap((tag) =>
    tag === ""
      ? Effect.succeed("")
      : text("git log", () => $`git log -1 --format=%cI ${tag}`.cwd(root).quiet().nothrow()),
  ),
)

/** `commit` が、いまのコミットから辿れるか。手元に無いコミットは辿れないとみなす。 */
const isContained = (commit: string) =>
  commit === ""
    ? Effect.succeed(false)
    : Effect.map(
        run("git merge-base", () =>
          $`git merge-base --is-ancestor ${commit} HEAD`.cwd(root).quiet().nothrow(),
        ),
        (result) => result.exitCode === 0,
      )

interface PullRequestJson {
  readonly number: number
  readonly title: string
  readonly baseRefName: string
  readonly headRefName: string
  readonly headRefOid: string
  readonly mergeCommit: { readonly oid: string } | null
}

/** 前のリリースの後にマージした PR と、それぞれがいまのコミットに入っているか。 */
const mergedSince = (date: string): Effect.Effect<ReadonlyArray<MergedPullRequest>, Error> =>
  date === ""
    ? Effect.succeed([])
    : pipe(
        text("gh pr list", () =>
          $`gh pr list --state merged --limit 200 --search ${`merged:>${date}`} --json number,title,baseRefName,headRefName,headRefOid,mergeCommit`
            .cwd(root)
            .quiet()
            .nothrow(),
        ),
        Effect.map((json): ReadonlyArray<PullRequestJson> => (json === "" ? [] : JSON.parse(json))),
        Effect.flatMap(
          Effect.forEach((pr) =>
            Effect.map(
              Effect.all([isContained(pr.headRefOid), isContained(pr.mergeCommit?.oid ?? "")]),
              ([head, merge]): MergedPullRequest => ({
                number: pr.number,
                title: pr.title,
                baseRefName: pr.baseRefName,
                headRefName: pr.headRefName,
                contained: head || merge,
              }),
            ),
          ),
        ),
      )

/** 公開するパッケージの 1 つ (どれも同じバージョンで出す) が npm に出しているバージョン。 */
const npmVersionsOf = (name: string) =>
  pipe(
    text("npm view", () =>
      $`npm view ${name} versions --json --registry ${REGISTRY}`.quiet().nothrow(),
    ),
    Effect.map((json): ReadonlyArray<string> => {
      if (json === "") return []
      const parsed: unknown = JSON.parse(json)
      return Array.isArray(parsed) ? parsed : typeof parsed === "string" ? [parsed] : []
    }),
  )

const program = pipe(
  readWorkspaces(root),
  Effect.flatMap((workspaces) =>
    Effect.all({
      merged: Effect.flatMap(previousReleaseDate, mergedSince),
      npmVersions: Option.match(Arr.head(publishable(workspaces)), {
        onNone: () => Effect.succeed([]),
        onSome: ({ manifest }) => npmVersionsOf(manifest.name),
      }),
    }).pipe(
      Effect.map(({ merged, npmVersions }) =>
        releasePullRequestProblems({
          base,
          branch,
          workspaces,
          merged,
          npmVersions,
          order: Bun.semver.order,
        }),
      ),
    ),
  ),
  Effect.flatMap((problems) =>
    Arr.match(problems, {
      onEmpty: () => Effect.sync(() => console.log("リリースの PR に問題は無い")),
      onNonEmpty: (found) =>
        Effect.fail(new Error(`リリースの前に直すこと:\n- ${found.join("\n- ")}`)),
    }),
  ),
)

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
