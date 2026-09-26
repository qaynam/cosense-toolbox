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
import { unresolvedLinkDiagnostics } from "./diagnostics"
import { defaultSettings, parseOptionsOf, settingsOf } from "./settings"
import { computeTokens, encodeTokens, LEGEND } from "./tokens"
import { emptyIndex, type Index, readIndex, rootsOf } from "./workspace"

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

// --- Settings -----------------------------------------------------------------------------

/** What the reader set in the editor's initialization options (see settings.ts). */
const settings = Ref.unsafeMake(defaultSettings)

const currentSettings = () => Effect.runSync(Ref.get(settings))

/** How to parse, so notation reads as the site's build reads it. */
const currentParseOptions = () => parseOptionsOf(currentSettings())

const semanticTokensOf = (document: TextDocument): SemanticTokens => ({
  data: encodeTokens(
    computeTokens(document.getText(), {
      components: readsComponents(document),
      parseOptions: currentParseOptions(),
    }),
  ),
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
const index = Ref.unsafeMake<Option.Option<Index>>(Option.none())
const roots = Ref.unsafeMake<ReadonlyArray<string>>([])

/** The index as it stands; empty until it has been read once. */
const currentIndex = (): Index => Option.getOrElse(Effect.runSync(Ref.get(index)), () => emptyIndex)

// --- Diagnostics --------------------------------------------------------------------------

/**
 * Sends `document`'s links to missing pages. Nothing until the index has been read once:
 * against an empty index every link would be flagged, only to be cleared a moment later.
 */
const publishDiagnostics = (document: TextDocument): Effect.Effect<void> =>
  pipe(
    Effect.all([Ref.get(index), Ref.get(settings)]),
    Effect.flatMap(([read, set]) =>
      Option.match(read, {
        onNone: () => Effect.void,
        onSome: (pages) =>
          Effect.promise(() =>
            connection.sendDiagnostics({
              uri: document.uri,
              diagnostics: unresolvedLinkDiagnostics(pages, document.getText(), {
                severity: set.unresolvedLinks,
                components: readsComponents(document),
                parseOptions: parseOptionsOf(set),
              }),
            }),
          ),
      }),
    ),
  )

/**
 * Reads the index again in the background; requests meanwhile answer from the last one.
 * A page may have appeared or gone, so every open document is checked again after.
 */
const refreshIndex = (): void => {
  pipe(
    Ref.get(roots),
    Effect.flatMap(readIndex),
    Effect.flatMap((next) => Ref.set(index, Option.some(next))),
    Effect.flatMap(() => Effect.forEach(documents.all(), publishDiagnostics, { discard: true })),
    Effect.runFork,
  )
}

// --- Handlers -----------------------------------------------------------------------------

connection.onInitialize(({ workspaceFolders, initializationOptions }): InitializeResult => {
  const read = settingsOf(initializationOptions)
  Effect.runSync(Ref.set(settings, read))
  Effect.runSync(Ref.set(roots, rootsOf(workspaceFolders, read.sources)))
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

// Opening a document counts as a change, so this covers both.
documents.onDidChangeContent(({ document }) => {
  Effect.runFork(publishDiagnostics(document))
})

// A closed document's diagnostics would otherwise linger in the editor's problem list.
documents.onDidClose(({ document }) => {
  void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] })
})

connection.onCompletion(({ textDocument: { uri }, position }): CompletionItem[] =>
  withDocument(
    uri,
    (document) =>
      completionItems(currentIndex(), document.getText(), position, currentParseOptions()),
    [],
  ),
)

connection.onDefinition(({ textDocument: { uri }, position }): Definition | null =>
  withDocument(
    uri,
    (document) =>
      Option.getOrNull(
        definitionOf(currentIndex(), document.getText(), position, currentParseOptions()),
      ),
    null,
  ),
)

connection.languages.semanticTokens.on(({ textDocument: { uri } }): SemanticTokens =>
  // Asked before the document was synced: nothing to colour yet.
  withDocument(uri, semanticTokensOf, { data: [] }),
)

documents.listen(connection)
connection.listen()
