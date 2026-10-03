import {
  type AnyNode,
  normalizeLineEndings,
  parse,
  type ParseOptions,
} from "@cosense-toolbox/parser"
import { Match, Option } from "effect"

import { COMPONENT_LINE, fenceOf } from "./tokens"
import { branch, gather, leaf } from "./tree"

export interface BodyOptions {
  /** `.csnx`: a component line is JSX, and a bracket in it is not notation. */
  readonly components?: boolean
  /** How to parse: the site's notation extensions, so `[! 注意]` is not read as a link. */
  readonly parseOptions?: ParseOptions
  /** Whether a `---` fence on the first line opens YAML to skip (default: true). */
  readonly frontmatter?: boolean
}

/** A node, and the line it is on in the file. */
export interface InFile<N> {
  readonly node: N
  readonly line: number
}

/**
 * Every node of the body `pick` takes, with the line it is on in the file. The title line
 * holds no notation, and neither does a `.csnx` component line.
 */
export const bodyNodes = <N>(
  text: string,
  pick: (node: AnyNode) => Option.Option<N>,
  { components = false, parseOptions = {}, frontmatter = true }: BodyOptions = {},
): ReadonlyArray<InFile<N>> => {
  const lines = normalizeLineEndings(text).split("\n")
  // The parser never sees the frontmatter, so its line numbers start after the fence.
  const offset = Option.match(fenceOf(lines, frontmatter), {
    onNone: () => 0,
    onSome: (end) => end + 1,
  })
  const isComponentLine = (line: number) =>
    components && COMPONENT_LINE.test(lines[line + offset] ?? "")

  return gather(parse(lines.slice(offset).join("\n"), parseOptions), (node) =>
    Match.value(node).pipe(
      Match.when({ type: "title" }, () => leaf<InFile<N>>([])),
      Match.when({ type: "line" }, (line) =>
        isComponentLine(line.position.start.line) ? leaf<InFile<N>>([]) : branch<InFile<N>>([]),
      ),
      Match.orElse(() =>
        branch(
          Option.match(pick(node), {
            onNone: () => [],
            onSome: (picked) => [{ node: picked, line: node.position.start.line + offset }],
          }),
        ),
      ),
    ),
  )
}
