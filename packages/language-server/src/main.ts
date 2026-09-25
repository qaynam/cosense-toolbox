#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import { Array as Arr, Effect, Option, pipe } from 'effect'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  type InitializeResult,
  ProposedFeatures,
  type SemanticTokens,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node'
import { LEGEND, computeTokens, encodeTokens } from './tokens'

// TEMPORARY: whether the editor asks for tokens at all is the one thing that cannot be
// seen from outside. Remove once the Zed side is settled.
const DEBUG_LOG = '/tmp/cosense-ls.log'
const note = (what: string, detail?: unknown): void =>
  Effect.try(() =>
    appendFileSync(
      DEBUG_LOG,
      `${new Date().toISOString()} ${what} ${detail === undefined ? '' : JSON.stringify(detail)}\n`,
    ),
  ).pipe(Effect.ignore, Effect.runSync)

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/** The language ids editors give `.csnx`. Not every editor names the language the same way. */
const CSNX_LANGUAGE_IDS: ReadonlyArray<string> = ['csnx', 'cosense-x']

/**
 * `.csnx` is `.csn` plus component lines, so the format is decided per document. The
 * language id the editor sends is trusted first; a file:// URI's suffix is the fallback.
 */
const readsComponents = (document: TextDocument): boolean =>
  Arr.contains(CSNX_LANGUAGE_IDS, document.languageId) || document.uri.endsWith('.csnx')

const semanticTokensOf = (document: TextDocument): SemanticTokens => {
  const tokens = computeTokens(document.getText(), { components: readsComponents(document) })
  note('semanticTokens/full', {
    languageId: document.languageId,
    tokens: tokens.length,
    first: tokens.slice(0, 4),
  })
  return { data: encodeTokens(tokens) }
}

connection.onInitialize((params): InitializeResult => {
  note('initialize', {
    client: params.clientInfo?.name,
    // Zed only advertises this when `semantic_tokens` is anything but "off".
    semanticTokens: params.capabilities.textDocument?.semanticTokens ?? null,
  })
  return {
    capabilities: {
      // Incremental: a page is one file the reader types into, and resending all of it on
      // every keystroke is what makes a large page feel slow.
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: { tokenTypes: [...LEGEND], tokenModifiers: [] },
        full: true,
      },
    },
  }
})

connection.languages.semanticTokens.on(
  ({ textDocument: { uri } }): SemanticTokens =>
    pipe(
      Option.fromNullable(documents.get(uri)),
      Option.match({
        // Asked before the document was synced: nothing to colour yet.
        onNone: () => {
          note('semanticTokens/full', { uri, synced: false })
          return { data: [] }
        },
        onSome: semanticTokensOf,
      }),
    ),
)

documents.listen(connection)
connection.listen()
