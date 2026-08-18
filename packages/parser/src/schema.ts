/**
 * schema.ts — AST の effect Schema 定義 (`@cosense-toolbox/parser/schema` サブパス)。
 *
 * パーサー本体はこれを使わない。自分でパースした結果は型が保証されているので検証は要らず、
 * 必要になるのは外から来た値 — 保存しておいた JSON を読み戻したとき、別プロセスから
 * 受け取ったとき、書き出したときとバージョンが違うとき — に限られる。
 * 使わない利用者のバンドルに載らないよう、メインエントリからは re-export しない。
 *
 * 型の単一情報源は types.ts の方であり、ここではない。各 Schema に `Schema.Schema<T>` を
 * 明示注釈してあるので、types.ts と定義がズレたらコンパイルエラーになる。
 * 逆に Schema から型を推論する形にすると、NodeMap への declaration merging が効かなくなる。
 */
import { Schema } from 'effect'
import type {
  CodeBlock,
  CodeLine,
  Decoration,
  ExternalLink,
  FormulaNode,
  Hashtag,
  IconNode,
  ImageNode,
  InlineCode,
  InlineNode,
  InternalLink,
  LineBlock,
  Page,
  Point,
  Position,
  ProjectLink,
  TableBlock,
  TableCell,
  TableRow,
  TextNode,
  TitleBlock,
  TopLevelBlock,
} from './types'

export const PointSchema: Schema.Schema<Point> = Schema.Struct({
  line: Schema.Number,
  column: Schema.Number,
  offset: Schema.Number,
})

export const PositionSchema: Schema.Schema<Position> = Schema.Struct({
  start: PointSchema,
  end: PointSchema,
})

const withPosition = { position: PositionSchema }

// --- インライン ---------------------------------------------------------

export const TextNodeSchema: Schema.Schema<TextNode> = Schema.Struct({
  type: Schema.Literal('text'),
  value: Schema.String,
  ...withPosition,
})

export const InternalLinkSchema: Schema.Schema<InternalLink> = Schema.Struct({
  type: Schema.Literal('internalLink'),
  label: Schema.String,
  target: Schema.String,
  ...withPosition,
})

export const ExternalLinkSchema: Schema.Schema<ExternalLink> = Schema.Struct({
  type: Schema.Literal('externalLink'),
  label: Schema.String,
  target: Schema.String,
  ...withPosition,
})

export const ProjectLinkSchema: Schema.Schema<ProjectLink> = Schema.Struct({
  type: Schema.Literal('projectLink'),
  label: Schema.String,
  target: Schema.String,
  project: Schema.String,
  title: Schema.String,
  ...withPosition,
})

export const HashtagSchema: Schema.Schema<Hashtag> = Schema.Struct({
  type: Schema.Literal('hashtag'),
  value: Schema.String,
  ...withPosition,
})

export const InlineCodeSchema: Schema.Schema<InlineCode> = Schema.Struct({
  type: Schema.Literal('inlineCode'),
  value: Schema.String,
  ...withPosition,
})

export const ImageNodeSchema: Schema.Schema<ImageNode> = Schema.Struct({
  type: Schema.Literal('image'),
  src: Schema.String,
  large: Schema.optionalWith(Schema.Boolean, { exact: true }),
  link: Schema.optionalWith(Schema.String, { exact: true }),
  ...withPosition,
})

export const IconNodeSchema: Schema.Schema<IconNode> = Schema.Struct({
  type: Schema.Literal('icon'),
  user: Schema.String,
  count: Schema.Number,
  ...withPosition,
})

export const FormulaNodeSchema: Schema.Schema<FormulaNode> = Schema.Struct({
  type: Schema.Literal('formula'),
  value: Schema.String,
  ...withPosition,
})

/** 装飾は中に装飾以外のインライン記法を持てるので、InlineNodeSchema を通じて再帰する。 */
export const DecorationSchema: Schema.Schema<Decoration> = Schema.Struct({
  type: Schema.Literal('decoration'),
  value: Schema.String,
  bold: Schema.Boolean,
  italic: Schema.Boolean,
  strike: Schema.Boolean,
  underline: Schema.Boolean,
  sizeLevel: Schema.Number,
  children: Schema.Array(Schema.suspend((): Schema.Schema<InlineNode> => InlineNodeSchema)),
  ...withPosition,
})

export const InlineNodeSchema: Schema.Schema<InlineNode> = Schema.Union(
  TextNodeSchema,
  InternalLinkSchema,
  ExternalLinkSchema,
  ProjectLinkSchema,
  HashtagSchema,
  InlineCodeSchema,
  ImageNodeSchema,
  IconNodeSchema,
  FormulaNodeSchema,
  DecorationSchema,
)

// --- ブロック -----------------------------------------------------------

export const TitleBlockSchema: Schema.Schema<TitleBlock> = Schema.Struct({
  type: Schema.Literal('title'),
  value: Schema.String,
  children: Schema.Array(InlineNodeSchema),
  ...withPosition,
})

export const CodeLineSchema: Schema.Schema<CodeLine> = Schema.Struct({
  type: Schema.Literal('codeLine'),
  value: Schema.String,
  ...withPosition,
})

export const CodeBlockSchema: Schema.Schema<CodeBlock> = Schema.Struct({
  type: Schema.Literal('codeBlock'),
  filename: Schema.String,
  indent: Schema.Number,
  lines: Schema.Array(CodeLineSchema),
  ...withPosition,
})

export const TableCellSchema: Schema.Schema<TableCell> = Schema.Struct({
  type: Schema.Literal('tableCell'),
  value: Schema.String,
  ...withPosition,
})

export const TableRowSchema: Schema.Schema<TableRow> = Schema.Struct({
  type: Schema.Literal('tableRow'),
  cells: Schema.Array(TableCellSchema),
  ...withPosition,
})

export const TableBlockSchema: Schema.Schema<TableBlock> = Schema.Struct({
  type: Schema.Literal('table'),
  name: Schema.String,
  indent: Schema.Number,
  rows: Schema.Array(TableRowSchema),
  ...withPosition,
})

export const LineBlockSchema: Schema.Schema<LineBlock> = Schema.Struct({
  type: Schema.Literal('line'),
  indent: Schema.Number,
  quote: Schema.Boolean,
  monospace: Schema.Boolean,
  children: Schema.Array(InlineNodeSchema),
  ...withPosition,
})

export const TopLevelBlockSchema: Schema.Schema<TopLevelBlock> = Schema.Union(
  TitleBlockSchema,
  CodeBlockSchema,
  TableBlockSchema,
  LineBlockSchema,
)

export const PageSchema: Schema.Schema<Page> = Schema.Struct({
  type: Schema.Literal('page'),
  children: Schema.Array(TopLevelBlockSchema),
  ...withPosition,
})

/**
 * 未知の値を `Page` として検証する。成功なら `Right<Page>`、失敗なら `Left<ParseError>`。
 * パースそのものは失敗しないので、このパッケージで Either を返すのはここだけ。
 */
export const decodePage = Schema.decodeUnknownEither(PageSchema)
