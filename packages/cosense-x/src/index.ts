/**
 * `@cosense-toolbox/cosense-x` — Cosense の記法を JSX のモジュールにする。MDX の Cosense 版。
 *
 * リンクグラフだけが要るなら `./graph`、Cosense からページを取ってくるなら `./fetch` を使う。
 */
export { compile } from './compile'
export type { CompileOptions, CompileResult } from './compile'
export { groupComponents, parseClosingTag, parseComponentTag } from './components'
export type {
  ComponentAttribute,
  ComponentAttributeValue,
  ComponentBlock,
  ComponentTag,
  GroupedBlock,
} from './components'
export { findInlineComponents } from './inline-components'
export type {
  FindInlineComponentsOptions,
  InlineComponent,
  InlinePart,
} from './inline-components'
export { readFrontmatter, splitFrontmatter } from './frontmatter'
export type { Frontmatter, ReadFrontmatterResult, SplitFrontmatterResult } from './frontmatter'
export {
  createIndex,
  createLinkResolver,
  defaultPageUrl,
  defaultProjectUrl,
  findByTitle,
} from './links'
export type {
  IndexInput,
  IndexedPage,
  LinkOptions,
  LinkTarget,
  PageIndex,
  UnresolvedLinkPolicy,
} from './links'
export { collectMetadata } from './metadata'
export type { CollectMetadataOptions, PageMetadata } from './metadata'
export { formatOf, readPage } from './read'
export type { Format, ReadOptions, ReadResult } from './read'
export { isRelativePath, normalizeTitle, resolveRelativePath, titleToSlug } from './title'
export { defaultResolveLink, toHast } from './to-hast'
export type {
  CosenseComponent,
  HastHighlighter,
  RenderOptions,
  ResolvedLink,
  ToHastOptions,
} from './to-hast'
