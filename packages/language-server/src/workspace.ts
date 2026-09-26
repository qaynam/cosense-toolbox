import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { parse } from "@cosense-toolbox/parser"
import { collectLinks } from "@cosense-toolbox/parser/utils"
import { Array as Arr, Effect, Option, pipe } from "effect"

import { normalizeForMatch } from "./completion"

/**
 * The pages a workspace holds, read from disk.
 *
 * This is the one place the language server differs from a Cosense client: there is no
 * project and no account, only `.csn` and `.csnx` files. A title is what the file calls
 * itself: its first line.
 */
export interface Page {
  readonly title: string
  /** `file://` URI of the file the title came from, absent for a link with no page yet. */
  readonly uri?: string
}

export interface Index {
  /** Every page, those with a file first, then the ones only linked to. */
  readonly pages: ReadonlyArray<Page>
}

export const emptyIndex: Index = { pages: [] }

// --- Finding the files --------------------------------------------------------------------

const PAGE_EXTENSIONS: ReadonlyArray<string> = [".csn", ".csnx"]

// Directories that never hold pages and can be very large. Skipped by name, because
// walking into node_modules is the difference between instant and unusable.
const SKIP_DIRECTORIES: ReadonlyArray<string> = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".astro",
  ".turbo",
  ".cache",
]

/** A directory's entries. One that cannot be read holds nothing, rather than failing the walk. */
const entriesOf = (directory: string): Effect.Effect<ReadonlyArray<Dirent>> =>
  pipe(
    Effect.tryPromise(() => readdir(directory, { withFileTypes: true })),
    Effect.orElseSucceed(() => []),
  )

/** Every page file under `directory`, depth-first, in the order the directory lists them. */
const pageFiles = (directory: string): Effect.Effect<ReadonlyArray<string>> =>
  pipe(
    entriesOf(directory),
    Effect.map(Arr.filter((entry) => !entry.name.startsWith("."))),
    Effect.flatMap(
      Effect.forEach((entry) => {
        const path = join(directory, entry.name)
        return entry.isDirectory()
          ? Arr.contains(SKIP_DIRECTORIES, entry.name)
            ? Effect.succeed([])
            : pageFiles(path)
          : Effect.succeed(Arr.contains(PAGE_EXTENSIONS, extname(entry.name)) ? [path] : [])
      }),
    ),
    Effect.map(Arr.flatten),
  )

// --- Reading one file ---------------------------------------------------------------------

/** `text` past the leading `---` fence, which is YAML rather than a line of the page. */
const withoutFrontmatter = (text: string): string =>
  pipe(
    Option.liftPredicate(text, (all) => all.startsWith("---\n")),
    Option.flatMap((all) =>
      pipe(
        all.indexOf("\n---", 3),
        Option.liftPredicate((end) => end !== -1),
        Option.map((end) => all.slice(end + 4)),
      ),
    ),
    Option.getOrElse(() => text),
  )

const firstLine = (text: string): Option.Option<string> =>
  pipe(
    text.split("\n"),
    Arr.map((line) => line.trim()),
    Arr.findFirst((line) => line !== ""),
  )

/**
 * What the file calls itself: its first line.
 *
 * The frontmatter is skipped rather than read. Cosense has no notion of a title held apart
 * from the text — the first line *is* the title, and a link finds a page by it. A `title:`
 * that disagreed with the first line would name a page nobody can see, so it is ignored
 * here even though `metadata.ts` still prefers it.
 *
 * An empty file falls back to its name, so it stays linkable.
 */
const titleOf = (path: string, text: string): string =>
  pipe(
    firstLine(withoutFrontmatter(text.replace(/\r\n?/g, "\n"))),
    Option.getOrElse(() => basename(path, extname(path))),
  )

/** One page file, as its page and the titles its `[link]`s and `#tag`s point at. */
interface PageFile {
  readonly page: Page
  readonly links: ReadonlyArray<string>
}

/** A file that cannot be read is left out of the index rather than failing it. */
const readPageFile = (path: string): Effect.Effect<Option.Option<PageFile>> =>
  pipe(
    Effect.tryPromise(() => readFile(path, "utf8")),
    Effect.map((text) =>
      Option.some({
        page: { title: titleOf(path, text), uri: pathToFileURL(path).href },
        links: collectLinks(parse(text)),
      }),
    ),
    Effect.orElseSucceed(() => Option.none()),
  )

// --- The index ----------------------------------------------------------------------------

/**
 * The files' pages, then the pages only linked to.
 *
 * Pages that are only linked to are indexed as well, without a uri. Cosense lets a link
 * name a page that does not exist yet, and offering those back is most of what makes its
 * completion feel like it knows the project. A file wins over a link of the same name: it
 * is the one that can be opened.
 */
const indexOf = (files: ReadonlyArray<PageFile>): Index => {
  const key = (title: string) => normalizeForMatch(title)
  // A later file of the same title takes the earlier one's place, as a Map built from
  // entries does.
  const withFiles = new Map(files.map(({ page }) => [key(page.title), page] as const))
  const onlyLinked = pipe(
    files,
    Arr.flatMap(({ links }) => links),
    Arr.filter((title) => !withFiles.has(key(title))),
    Arr.dedupeWith((a, b) => key(a) === key(b)),
    Arr.map((title): Page => ({ title })),
  )
  return { pages: [...withFiles.values(), ...onlyLinked] }
}

/** Read every page under `roots` and index it. */
export const readIndex = (roots: ReadonlyArray<string>): Effect.Effect<Index> =>
  pipe(
    Effect.forEach(roots, pageFiles),
    Effect.map(Arr.flatten),
    Effect.flatMap(Effect.forEach(readPageFile)),
    Effect.map((files) => indexOf(Arr.getSomes(files))),
  )

/** The workspace roots an initialize request names, as filesystem paths. */
export const rootsOf = (
  folders: ReadonlyArray<{ readonly uri: string }> | null | undefined,
): ReadonlyArray<string> =>
  Arr.filterMap(folders ?? [], ({ uri }) => Option.liftThrowable(fileURLToPath)(uri))
