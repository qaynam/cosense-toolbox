import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { Array as Arr, Effect, Match, Option, pipe } from "effect"

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

/** The page files one entry of `directory` holds: itself, what is under it, or none. */
const filesAt = (directory: string, entry: Dirent): Effect.Effect<ReadonlyArray<string>> =>
  Match.value(entry).pipe(
    Match.when(
      (dir) => dir.isDirectory() && Arr.contains(SKIP_DIRECTORIES, dir.name),
      () => Effect.succeed([]),
    ),
    Match.when(
      (dir) => dir.isDirectory(),
      () => pageFiles(join(directory, entry.name)),
    ),
    Match.when(
      (file) => Arr.contains(PAGE_EXTENSIONS, extname(file.name)),
      () => Effect.succeed([join(directory, entry.name)]),
    ),
    Match.orElse(() => Effect.succeed([])),
  )

/** Every page file under `directory`, depth-first, in the order the directory lists them. */
const pageFiles = (directory: string): Effect.Effect<ReadonlyArray<string>> =>
  pipe(
    entriesOf(directory),
    Effect.map(Arr.filter((entry) => !entry.name.startsWith("."))),
    Effect.flatMap(Effect.forEach((entry) => filesAt(directory, entry))),
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
const titleOf = (path: string, text: string, frontmatter: boolean): string =>
  pipe(
    text.replace(/\r\n?/g, "\n"),
    (normalized) =>
      Option.getOrElse(
        Option.map(
          Option.liftPredicate(normalized, () => frontmatter),
          withoutFrontmatter,
        ),
        () => normalized,
      ),
    firstLine,
    Option.getOrElse(() => basename(path, extname(path))),
  )

/** `path` from `root`, with `/` between directories whatever the platform. */
const locationOf = (root: string, path: string): string => relative(root, path).split(sep).join("/")

/** How the pages are read. */
export interface ReadIndexOptions {
  /**
   * Whether a `---` fence on the first line opens YAML to skip (default: true). Off for
   * Cosense pages, which have no frontmatter: a page titled `---` keeps its title.
   */
  readonly frontmatter?: boolean
}

/** A page file as read: the page it makes, where it is on disk, and its text. */
export interface PageFile {
  readonly page: Page
  readonly path: string
  readonly text: string
}

/** A file that cannot be read is left out rather than failing the rest. */
const readPageFile = (
  root: string,
  path: string,
  { frontmatter = true }: ReadIndexOptions,
): Effect.Effect<Option.Option<PageFile>> =>
  pipe(
    Effect.tryPromise(() => readFile(path, "utf8")),
    Effect.map((text) =>
      Option.some({
        page: {
          title: titleOf(path, text, frontmatter),
          uri: pathToFileURL(path).href,
          location: locationOf(root, path),
        },
        path,
        text,
      }),
    ),
    Effect.orElseSucceed(() => Option.none()),
  )

/** The page files under one root. */
const filesUnder =
  (options: ReadIndexOptions) =>
  (root: string): Effect.Effect<ReadonlyArray<PageFile>> =>
    pipe(
      pageFiles(root),
      Effect.flatMap(Effect.forEach((path) => readPageFile(root, path, options))),
      Effect.map(Arr.getSomes),
    )

/**
 * Every page file under `roots`. Roots may overlap (`src` and `src/content`), so a file
 * found twice is kept once, where it was first found.
 */
export const readPageFiles = (
  roots: ReadonlyArray<string>,
  options: ReadIndexOptions = {},
): Effect.Effect<ReadonlyArray<PageFile>> =>
  pipe(
    Effect.forEach(roots, filesUnder(options)),
    Effect.map((found) => Arr.dedupeWith(Arr.flatten(found), (a, b) => a.path === b.path)),
  )

/** The pages of `files`, as an index. */
export const indexOf = (files: ReadonlyArray<PageFile>): Index => ({
  pages: Arr.map(files, (file) => file.page),
})

/** Read every page under `roots` and index it. */
export const readIndex = (
  roots: ReadonlyArray<string>,
  options: ReadIndexOptions = {},
): Effect.Effect<Index> => Effect.map(readPageFiles(roots, options), indexOf)

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
      Arr.match(sources, {
        onEmpty: () => [folder],
        onNonEmpty: (under) => Arr.map(under, (source) => resolve(folder, source)),
      }),
    ),
  )
