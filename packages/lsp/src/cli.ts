import { Array as Arr, Match } from "effect"

import { version } from "../package.json"

/**
 * What `csn-lsp` is asked to do, read from its arguments before anything is loaded: the
 * server opens its connection as it loads, which `check` and `--help` must not do.
 */

export const USAGE = `Usage: csn-lsp --stdio
       csn-lsp check [directory ...] [options]

csn-lsp --stdio starts the language server for .csn and .csnx, which an editor talks to over
stdin and stdout. --node-ipc, --socket=<port> and --pipe=<name> are the other ways to talk.

csn-lsp check reports the links to missing pages and files: see csn-lsp check --help.

Options:
  -h, --help  print this help
  --version   print the version
`

export type Command =
  | { readonly _tag: "serve" }
  | { readonly _tag: "check"; readonly args: ReadonlyArray<string> }
  /** Print `output` and exit with `exitCode`, starting nothing. */
  | { readonly _tag: "print"; readonly output: string; readonly exitCode: number }

/**
 * Whether `arg` says how to talk to the editor, as vscode-languageserver reads the arguments.
 * Without one, the server cannot start.
 */
const isTransport = (arg: string): boolean =>
  Arr.contains(["--stdio", "--node-ipc", "--socket", "--pipe"], arg) ||
  arg.startsWith("--socket=") ||
  arg.startsWith("--pipe=")

export const commandOf = (args: ReadonlyArray<string>): Command =>
  Match.value(args).pipe(
    Match.when(
      ([first]) => first === "check",
      ([, ...rest]): Command => ({ _tag: "check", args: rest }),
    ),
    Match.when(
      ([first]) => first === "--help" || first === "-h",
      (): Command => ({ _tag: "print", output: USAGE, exitCode: 0 }),
    ),
    Match.when(
      ([first]) => first === "--version",
      (): Command => ({ _tag: "print", output: `${version}\n`, exitCode: 0 }),
    ),
    // Anywhere, as vscode-languageserver looks for it: an editor may add arguments of its own
    // (VS Code adds `--clientProcessId=…`).
    Match.when(
      (all) => Arr.some(all, isTransport),
      (): Command => ({ _tag: "serve" }),
    ),
    Match.orElse((): Command => ({ _tag: "print", output: USAGE, exitCode: 2 })),
  )
