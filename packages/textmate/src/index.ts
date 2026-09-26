/**
 * TextMate grammars for Cosense notation: `.csn` and, with component lines, `.csnx`.
 *
 * Each export is a Shiki `LanguageRegistration` as it stands, and the same objects are
 * published as `.tmLanguage.json` for editors that read TextMate grammars.
 */
import { buildGrammar, type Grammar } from "./grammar"

export type { Dialect, Grammar, Rule } from "./grammar"
export { type Notation, SCOPES } from "./scopes"

export const cosense: Grammar = buildGrammar("cosense")

export const cosenseX: Grammar = buildGrammar("cosense-x")
