#!/usr/bin/env node
/**
 * `csn-lsp`: the language server, or with `check` as its first argument, a one-off check of
 * a site's pages that exits with a code a build can act on. `csn-lsp --help` says how.
 *
 * Each is loaded only when asked for: the server opens its connection as it loads, which a
 * check must not do.
 */
import { Cause, Effect, Match, pipe } from "effect"

import type { CheckResult } from "./check"
import { commandOf } from "./cli"

const print = ({ output, exitCode }: CheckResult) =>
  Effect.sync(() => {
    // A usage error goes where errors go; reports, the help and the version are the output.
    ;(exitCode === 2 ? process.stderr : process.stdout).write(output)
    process.exitCode = exitCode
  })

const check = (args: ReadonlyArray<string>) =>
  pipe(
    Effect.promise(() => import("./check")),
    Effect.flatMap(({ runCheck }) => runCheck(args, process.cwd())),
    Effect.flatMap(print),
  )

const serve = Effect.promise(() => import("./server"))

Effect.runFork(
  pipe(
    commandOf(process.argv.slice(2)),
    Match.valueTags({
      serve: () => Effect.asVoid(serve),
      check: ({ args }) => check(args),
      print,
    }),
    // runFork drops a defect without a word, and the process would exit with 0. A server that
    // cannot start (a transport it cannot use) and a bug alike are said where errors go.
    Effect.catchAllDefect((defect) =>
      Effect.sync(() => {
        process.stderr.write(`${Cause.pretty(Cause.die(defect))}\n`)
        process.exitCode = 1
      }),
    ),
  ),
)
