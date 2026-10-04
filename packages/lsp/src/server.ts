import { fileURLToPath } from "node:url"

import type { ParseOptions } from "@cosense-toolbox/parser"
import { Array as Arr, Effect, Option, pipe, Ref } from "effect"
import {
  type CodeAction,
  CodeActionKind,
  type CompletionList,
  createConnection,
  type Definition,
  type InitializeResult,
  ProposedFeatures,
  type SemanticTokens,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node"
import { TextDocument } from "vscode-languageserver-textdocument"

import { completionItems, definitionOf, detectCompletionInDocument } from "./completion"
import { unresolvedLinkDiagnostics } from "./diagnostics"
import { mapLinkActions, mapLinkDiagnostics } from "./map-link"
import { mediaCompletionItems, mediaFilesIn, missingMediaDiagnostics } from "./media"
import { defaultSettings, settingsOf } from "./settings"
import { computeTokens, encodeTokens, legendFor } from "./tokens"
import {
  emptyIndex,
  findMediaRoots,
  type Index,
  readIndex,
  rootsOf,
  siteOf,
  withSiteFiles,
} from "./workspace"

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

// --- Sites -------------------------------------------------------------------------------

/** The workspace folders, where the sites are looked for. */
const folders = Ref.unsafeMake<ReadonlyArray<string>>([])

/**
 * Each site's media root (see `mediaRoot` in settings.ts) and the files there, as site paths.
 * A repository can hold several sites, so each page belongs to the nearest one above it.
 */
const sites = Ref.unsafeMake<ReadonlyMap<string, ReadonlyArray<string>>>(new Map())

const currentSites = () => Effect.runSync(Ref.get(sites))

const pathOf = (document: TextDocument): Option.Option<string> =>
  Option.liftThrowable(fileURLToPath)(document.uri)

/**
 * How a page is parsed: as Cosense Web does, plus `[:/…]` as its site's files when it is in
 * a site.
 */
const parseOptionsOf = (document: TextDocument): ParseOptions =>
  Option.match(pathOf(document), {
    onNone: () => ({}),
    onSome: (path) => withSiteFiles({}, path, [...currentSites().keys()]),
  })

/** The files of the site `document` is in, or none outside a site. */
const siteFilesOf = (document: TextDocument): ReadonlyArray<string> =>
  pipe(
    pathOf(document),
    Option.flatMap((path) => siteOf(path, [...currentSites().keys()])),
    Option.flatMap((root) => Option.fromNullable(currentSites().get(root))),
    Option.getOrElse((): ReadonlyArray<string> => []),
  )

const semanticTokensOf = (document: TextDocument): SemanticTokens => ({
  data: encodeTokens(
    computeTokens(document.getText(), {
      components: readsComponents(document),
      frontmatter: currentSettings().frontmatter,
      parseOptions: parseOptionsOf(document),
    }),
    legendFor(currentSettings().tokenNames),
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
 * Sends `document`'s links to missing pages, and its Google Maps URLs Cosense would write as
 * maps. Nothing until the index has been read once: against an empty index every link would
 * be flagged, only to be cleared a moment later.
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
              diagnostics: [
                ...unresolvedLinkDiagnostics(pages, document.getText(), {
                  severity: set.unresolvedLinks,
                  components: readsComponents(document),
                  frontmatter: set.frontmatter,
                  parseOptions: parseOptionsOf(document),
                }),
                ...missingMediaDiagnostics(document.getText(), new Set(siteFilesOf(document)), {
                  severity: set.unresolvedLinks,
                  components: readsComponents(document),
                  frontmatter: set.frontmatter,
                  parseOptions: parseOptionsOf(document),
                }),
                ...mapLinkDiagnostics(document.getText(), {
                  severity: set.mapLinks,
                  components: readsComponents(document),
                  frontmatter: set.frontmatter,
                  parseOptions: parseOptionsOf(document),
                }),
              ],
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
    Effect.all([Ref.get(roots), Ref.get(settings), Ref.get(folders)]),
    // The sites and their files change outside the pages, so they are read again first.
    Effect.flatMap(([at, set, workspace]) =>
      pipe(
        findMediaRoots(workspace, set.mediaRoot),
        Effect.flatMap((found) =>
          Effect.forEach(found, (root) =>
            Effect.map(mediaFilesIn(root), (files) => [root, files] as const),
          ),
        ),
        Effect.flatMap((found) => Ref.set(sites, new Map(found))),
        Effect.flatMap(() =>
          readIndex(at, { frontmatter: set.frontmatter, mediaRoots: [...currentSites().keys()] }),
        ),
      ),
    ),
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
  Effect.runSync(Ref.set(folders, rootsOf(workspaceFolders, [])))
  refreshIndex()
  return {
    capabilities: {
      // Incremental: a page is one file the reader types into, and resending all of it on
      // every keystroke is what makes a large page feel slow.
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: { tokenTypes: [...legendFor(read.tokenNames)], tokenModifiers: [] },
        full: true,
      },
      // `[` and `#` open a link and a tag, and the editor asks again on every character
      // after one while its menu is open. `/` is for `[:/` (a site's file): by then the menu
      // has closed when no page title starts with `:`, and nothing else would reopen it.
      completionProvider: { triggerCharacters: ["[", "#", "/"] },
      definitionProvider: true,
      codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
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
  Effect.runFork(
    Effect.promise(() => connection.sendDiagnostics({ uri: document.uri, diagnostics: [] })),
  )
})

// Incomplete: the ranking (near matches, the order) is the server's, so the client asks again
// on every keystroke rather than filtering this list by itself.
connection.onCompletion(({ textDocument: { uri }, position }): CompletionList => ({
  isIncomplete: true,
  items: withDocument(
    uri,
    (document) =>
      pipe(
        detectCompletionInDocument(document.getText(), position, parseOptionsOf(document), {
          frontmatter: currentSettings().frontmatter,
        }),
        // Inside `[:/…`, the site's files rather than pages, once there are any to offer.
        Option.map((detection) =>
          mediaCompletionItems(siteFilesOf(document), detection, position.line),
        ),
        Option.filter(Arr.isNonEmptyArray),
        Option.getOrElse(() =>
          completionItems(currentIndex(), document.getText(), position, parseOptionsOf(document), {
            frontmatter: currentSettings().frontmatter,
          }),
        ),
      ),
    [],
  ),
}))

connection.onDefinition(({ textDocument: { uri }, position }): Definition | null =>
  withDocument(
    uri,
    (document) =>
      Option.getOrNull(
        definitionOf(currentIndex(), document.getText(), position, parseOptionsOf(document)),
      ),
    null,
  ),
)

connection.onCodeAction(({ textDocument: { uri }, range }): CodeAction[] =>
  withDocument(
    uri,
    (document) =>
      mapLinkActions(uri, document.getText(), range, {
        components: readsComponents(document),
        frontmatter: currentSettings().frontmatter,
        parseOptions: parseOptionsOf(document),
      }),
    [],
  ),
)

connection.languages.semanticTokens.on(({ textDocument: { uri } }): SemanticTokens =>
  // Asked before the document was synced: nothing to colour yet.
  withDocument(uri, semanticTokensOf, { data: [] }),
)

documents.listen(connection)
connection.listen()
