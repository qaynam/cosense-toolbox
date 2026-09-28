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

/** バージョンが揃っていなければ、それぞれの版を挙げる。 */
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
    ...(manifest.publishConfig?.access === "public" && manifest.publishConfig.tag !== undefined
      ? []
      : [`${name}: publishConfig に access: "public" と tag が無い`]),
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

/** semver の版 (pre-release と build metadata も含む)。先頭の `v` は付けない。 */
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
 * 指していないもの。`bun pm pack` は `workspace:*` を lockfile の版に書き換えるので、
 * バージョンを上げたあと lockfile を更新していないと、古い版が残る。
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
 * `bun pm pack` は `workspace:*` を lockfile に記録された版に書き換えるが、`bun install` は
 * package.json のバージョンだけが変わっても lockfile のその版を更新しない。そのため自分で揃える。
 */
export const withLockVersion = (lock: string, dir: string, version: string): string =>
  lock.replace(
    new RegExp(
      `("${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}": \\{\\s*"name": "[^"]*",\\s*"version": )"[^"]*"`,
    ),
    `$1"${version}"`,
  )
