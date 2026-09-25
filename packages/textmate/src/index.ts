/**
 * TextMate grammars for Cosense notation: `.csn` and, with component lines, `.csnx`.
 *
 * Each export is a Shiki `LanguageRegistration` as it stands, and the same objects are
 * published as `.tmLanguage.json` for editors that read TextMate grammars.
 */
import { type Grammar, buildGrammar } from './grammar'

export type { Grammar, Rule } from './grammar'
export { type Notation, SCOPES } from './scopes'

export const cosense: Grammar = buildGrammar({ components: false })

export const cosenseX: Grammar = buildGrammar({ components: true })
