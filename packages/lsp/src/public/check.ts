/**
 * `@cosense-toolbox/lsp/check`. The modules inside answer in effect's types; what is handed
 * out here is plain, so a user need not know effect.
 */
import { Effect } from "effect"

import {
  type CheckResult,
  type CheckSiteOptions,
  checkSite as checkSiteEffect,
  type Report,
  runCheck as runCheckEffect,
} from "../check"

export * from "../check"

/**
 * Every link to a missing page under `roots`, file by file in the order they were read.
 * The judgement is the editor's own, so what an editor flags is what is reported here.
 */
export const checkSite = (options: CheckSiteOptions): Promise<ReadonlyArray<Report>> =>
  Effect.runPromise(checkSiteEffect(options))

/** Runs a check as `args` asks, from `cwd`. Never rejects: a bad option is exit code 2. */
export const runCheck = (args: ReadonlyArray<string>, cwd: string): Promise<CheckResult> =>
  Effect.runPromise(runCheckEffect(args, cwd))
