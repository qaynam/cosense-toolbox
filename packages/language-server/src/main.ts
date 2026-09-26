#!/usr/bin/env node
import { Array as Arr, Effect, Option, pipe, Ref } from "effect"
import {
  type CompletionItem,
  createConnection,
  type Definition,
  type InitializeResult,
  ProposedFeatures,
  type SemanticTokens,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node"
import { TextDocument } from "vscode-languageserver-textdocument"

import { completionItems, definitionOf } from "./completion"
import { computeTokens, encodeTokens, LEGEND } from "./tokens"
import { emptyIndex, readIndex, rootsOf } from "./workspace"

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/** The language ids editors give `.csnx`. Not every editor names the language the same way. */
const CSNX_LANGUAGE_IDS: ReadonlyArray<string> = ["csnx", "cosense-x"]

/**
 * `.csnx` is `.csn` plus component lines, so the format is decided per document. The
 * language id the editor sends is trusted first; a file:// URI's suffix is the fallback.
 */
const readsComponents = (document: TextDocument): boolean =>
  Arr.contains(CSNX_LANGUAGE_IDS, document.languageId) || document.uri.endsWith(".csnx")

const semanticTokensOf = (document: TextDocument): SemanticTokens => ({
  data: encodeTokens(computeTokens(document.getText(), { components: readsComponents(document) })),
})

/**
 * `answer` for the open document at `uri`, or `fallback` when the editor asks about one it
 * has not synced yet.
 */
const withDocument = <A>(uri: string, answer: (document: TextDocument) => A, fallback: A): A =>
  pipe(
    Option.fromNullable(documents.get(uri)),
    Option.map(answer),
    Option.getOrElse(() => fallback),
  )

// --- The workspace index --------------------------------------------------------------------

/**
 * Every page the workspace holds. Read once at initialize and again when a page is saved,
 * because a title only changes by someone writing it, and re-reading on every keystroke
 * would walk the whole tree while the reader is typing.
 */
const index = Ref.unsafeMake(emptyIndex)
const roots = Ref.unsafeMake<ReadonlyArray<string>>([])

/** Reads the index again in the background; requests meanwhile answer from the last one. */
const refreshIndex = (): void => {
  pipe(
    Ref.get(roots),
    Effect.flatMap(readIndex),
    Effect.flatMap((next) => Ref.set(index, next)),
    Effect.runFork,
  )
}

const currentIndex = () => Effect.runSync(Ref.get(index))

// --- Handlers -----------------------------------------------------------------------------

connection.onInitialize(({ workspaceFolders }): InitializeResult => {
  Effect.runSync(Ref.set(roots, rootsOf(workspaceFolders)))
  refreshIndex()
  return {
    capabilities: {
      // Incremental: a page is one file the reader types into, and resending all of it on
      // every keystroke is what makes a large page feel slow.
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: { tokenTypes: [...LEGEND], tokenModifiers: [] },
        full: true,
      },
      // `[` and `#` open a link and a tag. The editor asks again on every character after
      // one, so nothing else has to be declared for typing to keep the menu up to date.
      completionProvider: { triggerCharacters: ["[", "#"] },
      definitionProvider: true,
    },
  }
})

// A title only changes when a page is written, so the index is rebuilt then rather than
// on a timer or on every request.
documents.onDidSave(refreshIndex)

connection.onCompletion(({ textDocument: { uri }, position }): CompletionItem[] =>
  withDocument(
    uri,
    (document) => completionItems(currentIndex(), document.getText(), position),
    [],
  ),
)

connection.onDefinition(({ textDocument: { uri }, position }): Definition | null =>
  withDocument(
    uri,
    (document) => Option.getOrNull(definitionOf(currentIndex(), document.getText(), position)),
    null,
  ),
)

connection.languages.semanticTokens.on(({ textDocument: { uri } }): SemanticTokens =>
  // Asked before the document was synced: nothing to colour yet.
  withDocument(uri, semanticTokensOf, { data: [] }),
)

documents.listen(connection)
connection.listen()
