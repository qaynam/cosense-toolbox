/**
 * README の「スコープ」の節が、文法の付けるスコープを過不足なく載せているか。
 * `SCOPES` は Language Server の token と対になる記法ごとのスコープだけを持つので、
 * 行全体や記号に付くスコープの一覧は README にしか無い。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { cosense, cosenseX, type Rule } from "./index"

const README = readFileSync(join(import.meta.dirname, "..", "README.md"), "utf8")

/** README に書いた `….cosense` のスコープ名。`text.cosense-x` のような続きのある名前は切らない。 */
const documented: ReadonlySet<string> = new Set(README.match(/[\w.-]+\.cosense(?![\w-])/g))

/** 規則とその中の規則が付けるスコープ名。1 つの規則が空白で区切って複数付けることがある。 */
const scopesOf = (rule: Rule): string[] => [
  ...(rule.name?.split(" ") ?? []),
  ...[rule.captures, rule.beginCaptures, rule.endCaptures].flatMap((captures) =>
    Object.values(captures ?? {}).flatMap(scopesOf),
  ),
  ...(rule.patterns ?? []).flatMap(scopesOf),
]

const emitted: ReadonlySet<string> = new Set(
  [cosense, cosenseX].flatMap((grammar) =>
    [...grammar.patterns, ...Object.values(grammar.repository)].flatMap(scopesOf),
  ),
)

const missingFrom = (names: ReadonlySet<string>, list: ReadonlySet<string>): string[] =>
  [...names].filter((name) => !list.has(name))

describe("README のスコープ", () => {
  it("文法が付けるスコープは、どれも README に載っている", () => {
    expect(missingFrom(emitted, documented)).toEqual([])
  })

  it("README に載せたスコープは、どれも文法が付ける", () => {
    expect(missingFrom(documented, emitted)).toEqual([])
  })
})
