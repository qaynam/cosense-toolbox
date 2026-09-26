/**
 * The VS Code side of the Cosense language server.
 *
 * Colours come first from the TextMate grammar the extension contributes, so a page is
 * coloured before the server is up; the server's semantic tokens, completion, go to
 * definition and diagnostics follow. This file only starts the server and restarts it when
 * a `cosense.*` setting changes, since the server reads its settings once, at start.
 */
import { Effect, Option, pipe, Ref } from "effect"
import * as vscode from "vscode"
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node"

import { initializationOptionsOf, serverModuleOf } from "./options"

const clientOf = (context: vscode.ExtensionContext): LanguageClient => {
  const settings = vscode.workspace.getConfiguration("cosense")
  const module = serverModuleOf(settings.get("server.path"), context.extensionPath)
  const server = { module, transport: TransportKind.stdio }
  const serverOptions: ServerOptions = { run: server, debug: server }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "cosense" },
      { scheme: "file", language: "cosense-x" },
    ],
    initializationOptions: initializationOptionsOf((key) => settings.get(key)),
  }
  return new LanguageClient("csn-lsp", "Cosense", serverOptions, clientOptions)
}

/** The running client, if one is. */
const running = Ref.unsafeMake<Option.Option<LanguageClient>>(Option.none())

const stop: Effect.Effect<void> = pipe(
  Ref.getAndSet(running, Option.none()),
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.void,
      onSome: (client) => Effect.promise(() => client.stop()),
    }),
  ),
)

const start = (context: vscode.ExtensionContext): Effect.Effect<void> =>
  pipe(
    Effect.sync(() => clientOf(context)),
    Effect.tap((client) => Ref.set(running, Option.some(client))),
    Effect.flatMap((client) => Effect.promise(() => client.start())),
  )

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("cosense")) {
        void Effect.runPromise(Effect.andThen(stop, start(context)))
      }
    }),
  )
  await Effect.runPromise(start(context))
}

export const deactivate = (): Promise<void> => Effect.runPromise(stop)
