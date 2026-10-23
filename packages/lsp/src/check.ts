import { relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"

import type { ParseOptions } from "@cosense-toolbox/parser"
import { Array as Arr, Effect, Either, Match, Option, pipe, Predicate } from "effect"
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node"

import { decodeSeverity, SEVERITIES, type Severity, unresolvedLinkDiagnostics } from "./diagnostics"
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
  --no-frontmatter            read a first line of --- as the title, not as YAML
  -h, --help                  print this help
`

/** What the command prints, and the code it exits with. */
export interface CheckResult {
  readonly output: string
  readonly exitCode: number
}

/** Where to look and how to read, for `checkSite`. */
export interface CheckSiteOptions {
  /** The directories whose `.csn` / `.csnx` pages are read, and checked against each other. */
  readonly roots: ReadonlyArray<string>
  /** How a link to a missing page is reported; `off` reports none. */
  readonly unresolvedLinks: Severity
  /** How to parse: a site's notation extensions, as its build parses with. */
  readonly parseOptions?: ParseOptions
  /** Whether a `---` fence on a page's first line opens YAML to skip (default: true). */
  readonly frontmatter?: boolean
}

export type ReportLevel = "error" | "warning" | "information" | "hint"

/** One thing found: where, counting lines and columns from 1, how loudly, and what. */
export interface Report {
  readonly path: string
  readonly line: number
  readonly column: number
  readonly level: ReportLevel
  readonly message: string
}

/**
 * Reports are errors unless told otherwise: the command exists to stop a build, and a
 * warning that passes would not.
 */
const DEFAULT_LEVEL: Severity = "error"

/** What the arguments ask for: how the command is used, or a check. */
type Asked =
  { readonly _tag: "usage" } | { readonly _tag: "check"; readonly options: CheckSiteOptions }

/** The level `--unresolved-links` names, or what is wrong with it. */
const unresolvedLinksOf = (level: string | undefined): Either.Either<Severity, string> =>
  Option.match(Option.fromNullable(level), {
    onNone: () => Either.right(DEFAULT_LEVEL),
    onSome: (named) =>
      Either.fromOption(
        decodeSeverity(named),
        () => `--unresolved-links takes one of ${Arr.join(SEVERITIES, ", ")}, not "${named}"`,
      ),
  })

/** What `args` ask for, run from `cwd`, or what is wrong with them. */
const askedOf = (args: ReadonlyArray<string>, cwd: string): Either.Either<Asked, string> =>
  pipe(
    Either.try({
      try: () =>
        parseArgs({
          args: [...args],
          allowPositionals: true,
          strict: true,
          options: {
            "unresolved-links": { type: "string" },
            "no-frontmatter": { type: "boolean" },
            help: { type: "boolean", short: "h" },
          },
        }),
      catch: (error) => (error instanceof Error ? error.message : String(error)),
    }),
    Either.flatMap(({ values, positionals }): Either.Either<Asked, string> =>
      values.help === true
        ? Either.right({ _tag: "usage" })
        : Either.map(unresolvedLinksOf(values["unresolved-links"]), (unresolvedLinks) => ({
            _tag: "check",
            options: {
              roots: Arr.match(positionals, {
                onEmpty: () => [cwd],
                onNonEmpty: (directories) =>
                  Arr.map(directories, (directory) => resolve(cwd, directory)),
              }),
              unresolvedLinks,
              frontmatter: values["no-frontmatter"] !== true,
            },
          })),
    ),
  )

const levelOf = (severity: DiagnosticSeverity | undefined): ReportLevel =>
  Match.value(severity).pipe(
    Match.when(DiagnosticSeverity.Error, (): ReportLevel => "error"),
    Match.when(DiagnosticSeverity.Warning, (): ReportLevel => "warning"),
    Match.when(DiagnosticSeverity.Information, (): ReportLevel => "information"),
    Match.orElse((): ReportLevel => "hint"),
  )

/** A file's diagnostic as a report, counting from 1 where the LSP counts from 0. */
const reportOf =
  (file: PageFile) =>
  ({ range, severity, message }: Diagnostic): Report => ({
    path: file.path,
    line: range.start.line + 1,
    column: range.start.character + 1,
    level: levelOf(severity),
    // The LSP lets a message be markup; a report is text either way.
    message: Predicate.isString(message) ? message : message.value,
  })

/**
 * Every link to a missing page under `roots`, file by file in the order they were read.
 * The judgement is the editor's own, so what an editor flags is what is reported here.
 */
export const checkSite = ({
  roots,
  unresolvedLinks,
  parseOptions = {},
  frontmatter = true,
}: CheckSiteOptions): Effect.Effect<ReadonlyArray<Report>> =>
  Effect.map(readPageFiles(roots, { frontmatter }), (files) => {
    const index = indexOf(files)
    return Arr.flatMap(files, (file) =>
      Arr.map(
        unresolvedLinkDiagnostics(index, file.text, {
          severity: unresolvedLinks,
          components: file.path.endsWith(".csnx"),
          parseOptions,
          frontmatter,
        }),
        reportOf(file),
      ),
    )
  })

/** A report as a line of output: `path:line:column level message`, `path` from `cwd`. */
const lineOf =
  (cwd: string) =>
  ({ path, line, column, level, message }: Report): string =>
    `${relative(cwd, path).split(sep).join("/")}:${line}:${column} ${level} ${message}\n`

/**
 * Runs a check as `args` asks, from `cwd`. Never fails: `--help` is the usage with exit code
 * 0, and a bad option says what is wrong, then the usage, with exit code 2.
 */
export const runCheck = (args: ReadonlyArray<string>, cwd: string): Effect.Effect<CheckResult> =>
  Either.match(askedOf(args, cwd), {
    onLeft: (problem) =>
      Effect.succeed({ output: `csn-lsp check: ${problem}\n\n${USAGE}`, exitCode: 2 }),
    onRight: Match.valueTags({
      usage: () => Effect.succeed({ output: USAGE, exitCode: 0 }),
      check: ({ options }) =>
        Effect.map(checkSite(options), (reports) => ({
          output: Arr.map(reports, lineOf(cwd)).join(""),
          exitCode: Arr.some(reports, ({ level }) => level === "error") ? 1 : 0,
        })),
    }),
  })
