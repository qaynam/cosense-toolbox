#!/usr/bin/env node
import { Array as Arr, Option, pipe } from 'effect'
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

const semanticTokensOf = (document: TextDocument): SemanticTokens => ({
  data: encodeTokens(computeTokens(document.getText(), { components: readsComponents(document) })),
})

connection.onInitialize(
  (): InitializeResult => ({
    capabilities: {
      // Incremental: a page is one file the reader types into, and resending all of it on
      // every keystroke is what makes a large page feel slow.
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: { tokenTypes: [...LEGEND], tokenModifiers: [] },
        full: true,
      },
    },
  }),
)

connection.languages.semanticTokens.on(
  ({ textDocument: { uri } }): SemanticTokens =>
    pipe(
      Option.fromNullable(documents.get(uri)),
      Option.match({
        // Asked before the document was synced: nothing to colour yet.
        onNone: () => ({ data: [] }),
        onSome: semanticTokensOf,
      }),
    ),
)

documents.listen(connection)
connection.listen()
