/**
 * release.ts — このリポジトリのパッケージを、1 つのバージョンで一緒に公開するための判定。
 *
 * ファイルも npm も触らない純粋な関数だけを置く。読み書きは version.ts と publish.ts が行う。
 */
import { Array as Arr, Option, pipe, Predicate, Record as Rec } from "effect"

/** package.json のうち、公開の判定に使うところ。 */
export interface Manifest {
  readonly name: string
  readonly version: string
  readonly private?: boolean
  readonly files?: ReadonlyArray<string>
  readonly repository?:
    string | { readonly type?: string; readonly url?: string; readonly directory?: string }
  readonly publishConfig?: {
    readonly access?: string
    readonly tag?: string
    readonly registry?: string
  }
  readonly scripts?: Readonly<Record<string, string>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

/** ワークスペースの 1 つ。`dir` はリポジトリのルートからのパス (`packages/parser`)。 */
export interface Workspace {
  readonly dir: string
  readonly manifest: Manifest
  readonly hasLicense: boolean
  /** README.md の中身。無ければ空 */
  readonly readme: string
}

const SCOPE = "@cosense-toolbox/"

/** `packages/` の下の、private でないパッケージ。`apps/` や `tools/` は公開しない。 */
export const publishable = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<Workspace> =>
  Arr.filter(
    workspaces,
    ({ dir, manifest }) => dir.startsWith("packages/") && manifest.private !== true,
  )

/** 公開したときに利用者の手元で解決される、ほかのパッケージへの依存 (開発用は除く)。 */
const runtimeDependencies = ({ manifest }: Workspace): ReadonlyArray<string> =>
  Arr.filter(
    [...Rec.keys(manifest.dependencies ?? {}), ...Rec.keys(manifest.peerDependencies ?? {})],
    (name) => name.startsWith(SCOPE),
  )

/**
 * 依存されるものが先に来る順番。依存を待つ必要のないものは、渡された順を保つ。
 * 循環していれば、残りを渡された順のまま後ろに並べる (公開はできるが、順番は保証しない)。
 */
export const publishOrder = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<Workspace> => {
  const inRepo = new Set(Arr.map(workspaces, ({ manifest }) => manifest.name))
  const place = (
    placed: ReadonlyArray<Workspace>,
    rest: ReadonlyArray<Workspace>,
  ): ReadonlyArray<Workspace> => {
    const done = new Set(Arr.map(placed, ({ manifest }) => manifest.name))
    return pipe(
      Arr.findFirst(rest, (workspace) =>
        Arr.every(runtimeDependencies(workspace), (name) => !inRepo.has(name) || done.has(name)),
      ),
      Option.match({
        onNone: () => [...placed, ...rest],
        onSome: (next) =>
          place(
            [...placed, next],
            Arr.filter(rest, (w) => w !== next),
          ),
      }),
    )
  }
  return place([], workspaces)
}

/** バージョンが揃っていなければ、それぞれのバージョンを挙げる。 */
const versionProblems = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> =>
  Arr.dedupe(Arr.map(workspaces, ({ manifest }) => manifest.version)).length > 1
    ? [
        `バージョンが揃っていない: ${Arr.map(workspaces, ({ manifest }) => `${manifest.name} ${manifest.version}`).join(", ")}`,
      ]
    : []

const directoryOf = (repository: Manifest["repository"]): Option.Option<string> =>
  Predicate.isObject(repository) ? Option.fromNullable(repository.directory) : Option.none()

/** 1 つのパッケージが、公開の前に満たしていないこと。 */
const packageProblems = ({ dir, manifest, hasLicense }: Workspace): ReadonlyArray<string> => {
  const { name } = manifest
  const internal = Arr.filter(
    Rec.toEntries({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
    }),
    ([dependency]) => dependency.startsWith(SCOPE),
  )
  return [
    ...Arr.filterMap(internal, ([dependency, range]) =>
      range === "workspace:*"
        ? Option.none()
        : Option.some(`${name}: ${dependency} は workspace:* にする`),
    ),
    ...(manifest.publishConfig?.access === "public"
      ? []
      : [`${name}: publishConfig に access: "public" が無い`]),
    // dist-tag はバージョンから決める (distTagFor)。ここに書くと、v1 を出すときに消し忘れて
    // latest が動かなかったり、消した後のベータが安定バージョンを latest から押しのけたりする。
    ...(manifest.publishConfig?.tag === undefined
      ? []
      : [`${name}: publishConfig.tag は書かない (dist-tag はバージョンから決める)`]),
    ...(Option.contains(directoryOf(manifest.repository), dir)
      ? []
      : [`${name}: repository.directory が ${dir} を指していない`]),
    ...(hasLicense && (manifest.files ?? []).includes("LICENSE")
      ? []
      : [`${name}: LICENSE が無いか、files に入っていない`]),
    ...(manifest.scripts?.build === undefined || manifest.scripts.prepublishOnly !== undefined
      ? []
      : [`${name}: build があるのに prepublishOnly でビルドしていない`]),
  ]
}

/** 公開の前に直すこと。空なら公開してよい。 */
export const problemsOf = (workspaces: ReadonlyArray<Workspace>): ReadonlyArray<string> => [
  ...versionProblems(workspaces),
  ...Arr.flatMap(workspaces, packageProblems),
]

/** pre-release の付かないバージョン (`1.0.0`)。build metadata (`+…`) は見ない。 */
export const isStable = (version: string): boolean =>
  isVersion(version) && !(version.split("+")[0] ?? "").includes("-")

/**
 * 公開するバージョンに付ける dist-tag。
 *
 * - `override` があればそれ (`--tag` で渡したもの)
 * - 安定バージョンは latest
 * - 安定バージョンをまだ 1 つも出していないうちは、プレリリースも latest。守る安定バージョンが無いので、
 *   分けると latest だけが古いバージョンを指し続け、タグ無しで入れた人に古い API が入る
 * - 安定バージョンを出した後のプレリリースは、識別子 (`1.1.0-beta.1` なら beta) を使う。
 *   数字だけの識別子 (`1.1.0-0`) には名前が無いので next にする
 */
export const distTagFor = (
  version: string,
  published: ReadonlyArray<string>,
  override: Option.Option<string>,
): string =>
  Option.getOrElse(override, () => {
    if (isStable(version) || !Arr.some(published, isStable)) return "latest"
    const identifier =
      (version.split("+")[0] ?? "").split("-").slice(1).join("-").split(".")[0] ?? ""
    return /^[A-Za-z][0-9A-Za-z-]*$/.test(identifier) ? identifier : "next"
  })

/** semver のバージョン (pre-release と build metadata も含む)。先頭の `v` は付けない。 */
export const isVersion = (version: string): boolean =>
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)

/**
 * package.json の文字列の、トップレベルの `version` だけを書き換える。
 * JSON を読み直して書くと書き方 (1 行にまとめた配列など) が崩れるので、その行だけを替える。
 */
export const withVersion = (text: string, version: string): string =>
  text.replace(/^( {2}"version":\s*)"[^"]*"/m, `$1"${version}"`)

/**
 * 固めた (`bun pm pack`) あとの package.json で、ほかのパッケージへの依存のうち `version` を
 * 指していないもの。`bun pm pack` は `workspace:*` を lockfile のバージョンに書き換えるので、
 * バージョンを上げたあと lockfile を更新していないと、古いバージョンが残る。
 */
export const mismatchedPins = (packed: Manifest, version: string): ReadonlyArray<string> =>
  Arr.filterMap(
    Rec.toEntries({ ...packed.dependencies, ...packed.peerDependencies }),
    ([dependency, range]) =>
      dependency.startsWith(SCOPE) && range !== version
        ? Option.some(`${dependency} ${range}`)
        : Option.none(),
  )

/**
 * bun.lock の、`dir` のワークスペースの `version` だけを書き換える。
 *
 * `bun pm pack` は `workspace:*` を lockfile に記録されたバージョンに書き換えるが、`bun install` は
 * package.json のバージョンだけが変わっても lockfile のそのバージョンを更新しない。そのため自分で揃える。
 */
export const withLockVersion = (lock: string, dir: string, version: string): string =>
  lock.replace(
    new RegExp(
      `("${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}": \\{\\s*"name": "[^"]*",\\s*"version": )"[^"]*"`,
    ),
    `$1"${version}"`,
  )

/** `### 0.1.0-beta.9 の変更` のバージョン */
const CHANGES_HEADING = /^###\s+(\S+)\s+の変更/

/** 節を終える見出し。`### <バージョン> の変更` と同じ深さか、それより浅いもの。 */
const SECTION_END = /^#{1,3}\s/

/**
 * README の `### <バージョン> の変更` の節の中身。リリースノートに、パッケージごとの変更として載せる。
 * 節は次の同じ深さか浅い見出しの前で終わる。コードブロックの中の `#` は見出しとみなさない。
 * 見出しが無いか、中身が空なら None。
 */
export const changesOf = (readme: string, version: string): Option.Option<string> => {
  const lines = readme.split("\n")
  return pipe(
    Arr.findFirstIndex(lines, (line) => CHANGES_HEADING.exec(line)?.[1] === version),
    Option.map((start) => {
      const body = Arr.drop(lines, start + 1)
      // insideFence[i]: i 行目がコードブロックの中か (その行より前のフェンスの数で決まる)
      const insideFence = Arr.scan(body, false, (inside, line) =>
        /^\s*```/.test(line) ? !inside : inside,
      )
      const end = Arr.findFirstIndex(
        body,
        (line, index) => !(insideFence[index] ?? false) && SECTION_END.test(line),
      )
      return Arr.take(
        body,
        Option.getOrElse(end, () => body.length),
      )
        .join("\n")
        .trim()
    }),
    Option.filter((changes) => changes !== ""),
  )
}

/**
 * GitHub のリリースノートの、自動で作る PR の一覧の上に置く部分。
 * README に `version` の変更を書いたパッケージだけを、渡された順に、パッケージ名の見出しを付けて並べる。
 */
export const releaseNotesOf = (workspaces: ReadonlyArray<Workspace>, version: string): string =>
  Arr.filterMap(workspaces, ({ manifest, readme }) =>
    Option.map(changesOf(readme, version), (changes) => `## ${manifest.name}\n\n${changes}\n`),
  ).join("\n")

const RELEASE_BRANCH = /^release\/v(.+)$/

/** `release/v0.1.0-beta.9` のバージョン。リリースのブランチでなければ None。 */
export const versionOfBranch = (branch: string): Option.Option<string> =>
  pipe(Option.fromNullable(RELEASE_BRANCH.exec(branch)?.[1]), Option.filter(isVersion))

/** 前のリリースのあとにマージした PR と、それがリリースに入っているか。 */
export interface MergedPullRequest {
  readonly number: number
  readonly title: string
  /** マージした先のブランチ */
  readonly baseRefName: string
  readonly headRefName: string
  /** PR の中身 (head かマージのコミット) が、リリースするコミットにあるか */
  readonly contained: boolean
}

export interface ReleasePullRequest {
  /** PR を向けた先のブランチ */
  readonly base: string
  /** PR のブランチ (`release/v<バージョン>`) */
  readonly branch: string
  readonly workspaces: ReadonlyArray<Workspace>
  readonly merged: ReadonlyArray<MergedPullRequest>
  /** npm に出ているバージョン (公開するパッケージのどれか 1 つの) */
  readonly npmVersions: ReadonlyArray<string>
  /** バージョンの大小。負なら a が古い (semver の順) */
  readonly order: (a: string, b: string) => number
}

/** npm に対して、`version` を出してよいか。もうあるバージョンと、一番新しいバージョンより古いバージョンは出せない。 */
const npmProblems = (
  version: string,
  npmVersions: ReadonlyArray<string>,
  order: (a: string, b: string) => number,
): ReadonlyArray<string> =>
  Arr.contains(npmVersions, version)
    ? [`${version} は npm にもう出ている`]
    : pipe(
        Arr.reduce(npmVersions, Option.none<string>(), (newest, each) =>
          Option.match(newest, {
            onNone: () => Option.some(each),
            onSome: (current) => Option.some(order(each, current) > 0 ? each : current),
          }),
        ),
        Option.filter((newest) => order(version, newest) < 0),
        Option.match({
          onNone: () => [],
          onSome: (newest) => [`${version} は npm の一番新しいバージョン ${newest} より古い`],
        }),
      )

/** リリースノートに載せる変更が、どのパッケージの README にも無い。 */
const notesProblems = (workspaces: ReadonlyArray<Workspace>, version: string) =>
  releaseNotesOf(publishable(workspaces), version) === ""
    ? [
        `どのパッケージの README にも「### ${version} の変更」が無い (リリースノートに載せる変更を書く)`,
      ]
    : []

/**
 * リリースの PR を、マージする前に止める理由。
 *
 * どれも、積んだ PR を順にマージしたときに起きたこと。先の PR が main に入った後で、
 * 後の PR が main ではなく先の PR のブランチにマージされ、main に届かなかった。
 *
 * - main 以外に向けたリリースの PR は、マージしても main のバージョンが変わらない
 * - ブランチのバージョンと、パッケージのバージョンが揃っていない
 * - そのバージョンが npm にもうあるか、npm の一番新しいバージョンより古い
 * - 前のリリースの後にマージした PR が、リリースに入っていない (main に届かなかった)。
 *   前のリリースの PR は後のリリースが置き換えるので数えない
 * - リリースノートに載せる変更 (README の `### <バージョン> の変更`) が、どのパッケージにも無い
 */
export const releasePullRequestProblems = ({
  base,
  branch,
  workspaces,
  merged,
  npmVersions,
  order,
}: ReleasePullRequest): ReadonlyArray<string> => {
  const published = Arr.dedupe(Arr.map(publishable(workspaces), ({ manifest }) => manifest.version))
  return [
    ...(base === "main" ? [] : [`リリースの PR は main に向ける (今は ${base})`]),
    ...Option.match(versionOfBranch(branch), {
      onNone: () => [`リリースのブランチの名前は release/v<バージョン> にする (今は ${branch})`],
      onSome: (version) =>
        Arr.every(published, (each) => each === version)
          ? [...npmProblems(version, npmVersions, order), ...notesProblems(workspaces, version)]
          : [
              `ブランチのバージョン ${version} と、パッケージのバージョン ${published.join(", ")} が違う`,
            ],
    }),
    ...Arr.map(
      Arr.filter(merged, (pr) => !pr.contained && Option.isNone(versionOfBranch(pr.headRefName))),
      (pr) => `#${pr.number}「${pr.title}」がリリースに入っていない (マージ先: ${pr.baseRefName})`,
    ),
  ]
}
