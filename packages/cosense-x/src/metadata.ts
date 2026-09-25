/**
 * metadata.ts — ページから一覧や `<head>` に使う情報を集める。
 * frontmatter に同じ項目があれば、そちらを使う。
 */
import { asImageSrc, type InlineNode, type Page, type TopLevelBlock } from "@cosense-toolbox/parser"
import { toPlainText } from "@cosense-toolbox/parser/compile"
import { collect, firstImage } from "@cosense-toolbox/parser/utils"
import { Option, pipe } from "effect"

import { closingTagOf, componentTagOf, rawTextOfLine } from "./components"
import type { Frontmatter } from "./frontmatter"
import { isRelativePath, titleToSlug, uniqueTitles } from "./title"

export interface PageMetadata {
  /** frontmatter の `title`、なければ 1 行目 */
  readonly title: string
  /** frontmatter の `slug`、なければタイトルから作る */
  readonly slug: string
  /** frontmatter の `description`、なければ本文の冒頭 */
  readonly description: string
  /** frontmatter の `image`、なければ本文で最初の画像 */
  readonly image: string | null
  /** 本文の `[title]` の行き先。出現順・重複なし。相対パスのリンクは書かれたまま入る */
  readonly links: readonly string[]
  /** 本文の `#tag` と frontmatter の `tags`。出現順・重複なし */
  readonly tags: readonly string[]
  /** frontmatter の `draft` が true */
  readonly draft: boolean
}

/** 行の途中に書いたコンポーネントのタグ。説明文から取り除く */
const INLINE_TAG_RE = /<\/?[A-Z][A-Za-z0-9_]*(?:\s[^<>]*)?\/?>/g

const DESCRIPTION_MIN = 120
const DESCRIPTION_MAX = 160

/** 空でない文字列なら、その値。 */
const stringOf = (value: unknown): Option.Option<string> =>
  typeof value === "string" && value.trim() !== "" ? Option.some(value) : Option.none()

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : []

export interface CollectMetadataOptions {
  /**
   * `.csnx` のとき、パースに渡した文字列。コンポーネントの行を説明文から外すのに使う。
   */
  readonly componentsSource?: string
  /**
   * 相対パスのリンク (`[./foo.csn]`) の行き先のタイトル。本文と同じく、説明文にも
   * パスではなくタイトルを出すのに使う。undefined なら書かれたままのテキストにする。
   */
  readonly resolveRelativeLink?: (target: string) => string | undefined
}

/** 相対パスのリンクの表示を、リンク先のタイトルに置き換える。装飾の中も辿る。 */
const relabel = (
  nodes: readonly InlineNode[],
  resolve: (target: string) => string | undefined,
): InlineNode[] =>
  nodes.map((node) => {
    if (node.type === "decoration") return { ...node, children: relabel(node.children, resolve) }
    if (node.type !== "internalLink" || !isRelativePath(node.target)) return node
    return Option.match(Option.fromNullable(resolve(node.target)), {
      onNone: () => node,
      onSome: (title) => ({ ...node, label: title }),
    })
  })

/** 説明文に入れる、1 行ぶんの文字列。入れない行なら None。 */
const descriptionOfLine = (
  block: TopLevelBlock,
  options: CollectMetadataOptions,
): Option.Option<string> => {
  const source = options.componentsSource
  if (block.type !== "line") return Option.none()
  // 開始タグと閉じタグの行は入れない。中身の行は入れる。
  if (source !== undefined) {
    const raw = rawTextOfLine(source, block)
    if (Option.isSome(componentTagOf(raw)) || Option.isSome(closingTagOf(raw))) {
      return Option.none()
    }
  }
  const resolve = options.resolveRelativeLink
  const line =
    resolve === undefined ? block : { ...block, children: relabel(block.children, resolve) }
  // 行の途中のタグ (`<Badge />` など) は説明文に出さない。中身の文字は残す。
  const plain = toPlainText(line)
  const text = (source === undefined ? plain : plain.replace(INLINE_TAG_RE, ""))
    .replace(/\s+/g, " ")
    .trim()
  return text === "" ? Option.none() : Option.some(text)
}

/** 本文の冒頭から説明文を作る。検索結果やカードの抜粋に収まる長さで切る。 */
const describe = (page: Page, options: CollectMetadataOptions): string => {
  const { parts } = page.children
    .flatMap((block) => Option.toArray(descriptionOfLine(block, options)))
    .reduce<{ readonly parts: readonly string[]; readonly length: number }>(
      (taken, text) =>
        taken.length >= DESCRIPTION_MIN
          ? taken
          : { parts: [...taken.parts, text], length: taken.length + text.length },
      { parts: [], length: 0 },
    )
  const joined = parts.join(" ")
  return joined.length > DESCRIPTION_MAX ? `${joined.slice(0, DESCRIPTION_MAX - 1)}…` : joined
}

export const collectMetadata = (
  page: Page,
  frontmatter: Frontmatter,
  options: CollectMetadataOptions = {},
): PageMetadata => {
  const title = pipe(
    stringOf(frontmatter.title),
    Option.orElse(() =>
      Option.fromNullable(page.children.find((block) => block.type === "title")?.value),
    ),
    Option.getOrElse(() => ""),
  )
  const image = pipe(
    stringOf(frontmatter.image),
    Option.orElse(() =>
      Option.map(Option.fromNullable(firstImage(page)), (node) => asImageSrc(node.src) ?? node.src),
    ),
    Option.getOrNull,
  )
  return {
    title,
    slug: Option.getOrElse(stringOf(frontmatter.slug), () => titleToSlug(title)),
    description: Option.getOrElse(stringOf(frontmatter.description), () => describe(page, options)),
    image,
    links: uniqueTitles(collect(page, "internalLink").map((link) => link.target)),
    tags: uniqueTitles([
      ...stringsOf(frontmatter.tags),
      ...collect(page, "hashtag").map((tag) => tag.value),
    ]),
    draft: frontmatter.draft === true,
  }
}
