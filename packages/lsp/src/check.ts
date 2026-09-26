import { relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"

import { Array as Arr, Effect, Match, Option, pipe } from "effect"
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node"

import { severityOf, unresolvedLinkDiagnostics, type UnresolvedSeverity } from "./diagnostics"
import { parseOptionsOf, type Settings } from "./settings"
import { indexOf, type PageFile, readPageFiles } from "./workspace"

/**
 * `csn-lsp check`: the server's diagnostics for every page of a site, for a terminal or CI.
 *
 * The same functions decide as in the editor, so what the editor flags is what fails here.
 */

export const USAGE = `Usage: csn-lsp check [directory ...] [options]

Reads the .csn and .csnx pages under each directory (default: the current one) and reports
every [link] to a page none of them holds.

Options:
  --unresolved-links <level>  off | hint | information | warning | error (default: error)
  --decorations <markers>     the site's own decoration markers, as one string: '|!~#'
  --no-frontmatter            read a first line of --- as the title, not as YAML
`

/** What the command prints, and the code it exits with. */
export interface CheckResult {
  readonly output: string
  readonly exitCode: number
}

/** How a check is set up, from the command line. */
interface CheckArgs {
  readonly roots: ReadonlyArray<string>
  readonly settings: Settings
}

/**
 * Reports are errors unless told otherwise: the command exists to stop a build, and a
 * warning that passes would not.
 */
const DEFAULT_LEVEL: UnresolvedSeverity = "error"

const argsOf = (args: ReadonlyArray<string>, cwd: string): Option.Option<CheckArgs> =>
  pipe(
    Option.liftThrowable(parseArgs)({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        "unresolved-links": { type: "string" },
        decorations: { type: "string" },
        "no-frontmatter": { type: "boolean" },
      },
    }),
    Option.map(({ values, positionals }) => ({
      roots: Arr.match(positionals, {
        onEmpty: () => [cwd],
        onNonEmpty: (directories) => Arr.map(directories, (directory) => resolve(cwd, directory)),
      }),
      settings: {
        sources: [],
        // Each marker is one character, so a string of them is the list.
        decorations: Array.from(values.decorations ?? ""),
        unresolvedLinks: pipe(
          Option.fromNullable(values["unresolved-links"]),
          Option.match({ onNone: () => DEFAULT_LEVEL, onSome: severityOf }),
        ),
        frontmatter: values["no-frontmatter"] !== true,
      },
    })),
  )

const levelName = (severity: DiagnosticSeverity | undefined): string =>
  Match.value(severity).pipe(
    Match.when(DiagnosticSeverity.Error, () => "error"),
    Match.when(DiagnosticSeverity.Warning, () => "warning"),
    Match.when(DiagnosticSeverity.Information, () => "information"),
    Match.orElse(() => "hint"),
  )

/** One report line: `path:line:column level message`, counting lines and columns from 1. */
const lineOf =
  (location: string) =>
  ({ range, severity, message }: Diagnostic): string =>
    `${location}:${range.start.line + 1}:${range.start.character + 1} ${levelName(severity)} ${message}`

/** Every file's reports, in the order the files were read. */
const reportsOf = (
  files: ReadonlyArray<PageFile>,
  settings: Settings,
  cwd: string,
): ReadonlyArray<{ readonly line: string; readonly diagnostic: Diagnostic }> => {
  const index = indexOf(files)
  return Arr.flatMap(files, (file) =>
    Arr.map(
      unresolvedLinkDiagnostics(index, file.text, {
        severity: settings.unresolvedLinks,
        components: file.path.endsWith(".csnx"),
        parseOptions: parseOptionsOf(settings),
        frontmatter: settings.frontmatter,
      }),
      (diagnostic) => ({
        line: lineOf(relative(cwd, file.path).split(sep).join("/"))(diagnostic),
        diagnostic,
      }),
    ),
  )
}

/** Runs a check as `args` asks, from `cwd`. Never fails: a bad option is exit code 2. */
export const runCheck = (args: ReadonlyArray<string>, cwd: string): Effect.Effect<CheckResult> =>
  Option.match(argsOf(args, cwd), {
    onNone: () => Effect.succeed({ output: USAGE, exitCode: 2 }),
    onSome: ({ roots, settings }) =>
      pipe(
        readPageFiles(roots, { frontmatter: settings.frontmatter }),
        Effect.map((files) => reportsOf(files, settings, cwd)),
        Effect.map((reports) => ({
          output: Arr.map(reports, ({ line }) => `${line}\n`).join(""),
          exitCode: Arr.some(
            reports,
            ({ diagnostic }) => diagnostic.severity === DiagnosticSeverity.Error,
          )
            ? 1
            : 0,
        })),
      ),
  })
