#!/usr/bin/env node
/**
 * `csn-lsp`: the language server, or with `check` as its first argument, a one-off check of
 * a site's pages that exits with a code a build can act on.
 *
 * Each is loaded only when asked for: the server opens its connection as it loads, which a
 * check must not do.
 */
import { Effect, Match, pipe } from "effect"

const [command, ...args] = process.argv.slice(2)

const check = pipe(
  Effect.promise(() => import("./check")),
  Effect.flatMap(({ runCheck }) => runCheck(args, process.cwd())),
  Effect.tap(({ output, exitCode }) =>
    Effect.sync(() => {
      // A usage error goes where errors go; reports are the command's output.
      ;(exitCode === 2 ? process.stderr : process.stdout).write(output)
      process.exitCode = exitCode
    }),
  ),
)

const serve = Effect.promise(() => import("./server"))

Effect.runFork(
  Match.value(command).pipe(
    Match.when("check", () => Effect.asVoid(check)),
    Match.orElse(() => Effect.asVoid(serve)),
  ),
)
