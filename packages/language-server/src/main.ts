#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  type InitializeResult,
  ProposedFeatures,
  type SemanticTokens,
  type SemanticTokensParams,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node'
import { LEGEND, computeTokens, encodeTokens } from './tokens'

// TEMPORARY: whether the editor asks for tokens at all is the one thing that cannot be
// seen from outside. Remove once the Zed side is settled.
const DEBUG_LOG = '/tmp/cosense-ls.log'
const note = (what: string, detail?: unknown): void => {
  try {
    appendFileSync(
      DEBUG_LOG,
      `${new Date().toISOString()} ${what} ${detail === undefined ? '' : JSON.stringify(detail)}\n`,
    )
  } catch {}
}

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/**
 * `.csnx` is `.csn` plus component lines, so the format is decided per document. The
 * language id the editor sends is trusted first; a file:// URI's suffix is the fallback,
 * because not every editor names the language the same way.
 */
const readsComponents = (uri: string, languageId: string): boolean =>
  languageId === 'csnx' || languageId === 'cosense-x' || uri.endsWith('.csnx')

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

connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) {
    note('semanticTokens/full', { uri: params.textDocument.uri, synced: false })
    return { data: [] }
  }
  const tokens = computeTokens(doc.getText(), {
    components: readsComponents(doc.uri, doc.languageId),
  })
  note('semanticTokens/full', {
    languageId: doc.languageId,
    tokens: tokens.length,
    first: tokens.slice(0, 4),
  })
  return { data: encodeTokens(tokens) }
})

documents.listen(connection)
connection.listen()
