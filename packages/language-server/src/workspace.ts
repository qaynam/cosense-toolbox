import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { Array as Arr, Effect, Option, pipe } from "effect"

/**
 * The pages a workspace holds, read from disk.
 *
 * This is the one place the language server differs from a Cosense client: there is no
 * project and no account, only `.csn` and `.csnx` files. A title is what the file calls
 * itself: its first line.
 */
export interface Page {
  readonly title: string
  /** `file://` URI of the page's file. */
  readonly uri: string
  /**
   * Where the file is, from the root it was found under, with `/` between directories. Shown
   * next to the title so two pages of one title can be told apart.
   */
  readonly location: string
}

export interface Index {
  /**
   * Every page file, in the order the roots and their directories list them. A link to a
   * page is not a page: only a file is, since only a file has a first line to be its title.
   */
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

/** `path` from `root`, with `/` between directories whatever the platform. */
const locationOf = (root: string, path: string): string => relative(root, path).split(sep).join("/")

/** A file that cannot be read is left out of the index rather than failing it. */
const readPage = (root: string, path: string): Effect.Effect<Option.Option<Page>> =>
  pipe(
    Effect.tryPromise(() => readFile(path, "utf8")),
    Effect.map((text) =>
      Option.some({
        title: titleOf(path, text),
        uri: pathToFileURL(path).href,
        location: locationOf(root, path),
      }),
    ),
    Effect.orElseSucceed(() => Option.none()),
  )

/** The pages under one root. */
const pagesUnder = (root: string): Effect.Effect<ReadonlyArray<Page>> =>
  pipe(
    pageFiles(root),
    Effect.flatMap(Effect.forEach((path) => readPage(root, path))),
    Effect.map(Arr.getSomes),
  )

/**
 * Read every page under `roots` and index it. Roots may overlap (`src` and `src/content`),
 * so a file found twice is kept once, where it was first found.
 */
export const readIndex = (roots: ReadonlyArray<string>): Effect.Effect<Index> =>
  pipe(
    Effect.forEach(roots, pagesUnder),
    Effect.map((found) => ({
      pages: Arr.dedupeWith(Arr.flatten(found), (a, b) => a.uri === b.uri),
    })),
  )

/**
 * Where to read pages: each workspace folder, or each of `sources` under it when the reader
 * has set them. A folder that is not a `file://` URI has no files to read.
 */
export const rootsOf = (
  folders: ReadonlyArray<{ readonly uri: string }> | null | undefined,
  sources: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  pipe(
    Arr.filterMap(folders ?? [], ({ uri }) => Option.liftThrowable(fileURLToPath)(uri)),
    Arr.flatMap((folder) =>
      Arr.isNonEmptyReadonlyArray(sources)
        ? Arr.map(sources, (source) => resolve(folder, source))
        : [folder],
    ),
  )
