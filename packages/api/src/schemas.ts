/**
 * 応答を読むスキーマ。どの項目も既定の値付きの省略可 (`optionalWith` + `default`) にして、
 * 無い項目は空の値にし、知らない項目は捨てる。types.ts で `?` にしている項目だけは
 * `optionalWith({ exact: true })` にする。
 *
 * types.ts の型と合っているかは、ここで `Schema.Schema<A, I>` と書いて確かめずに、使う場所
 * (api.ts の `CosenseApiShape` の戻り値) で確かめる。`default` と `exact` で、元の値の型に
 * `undefined` を含むかが項目ごとに違うので、元の形を 1 つの型で書けないため。
 */
import { Schema } from "effect"

const optionalString = Schema.optionalWith(Schema.String, { default: () => "" })
const optionalNumber = Schema.optionalWith(Schema.Number, { default: () => 0 })
const optionalBoolean = Schema.optionalWith(Schema.Boolean, { default: () => false })
const optionalNullableString = Schema.optionalWith(Schema.NullOr(Schema.String), {
  default: () => null,
})
const optionalStrings = Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] })

const PageFilterSchema = Schema.Struct({
  type: optionalString,
  value: optionalString,
})

export const MeSchema = Schema.Struct({
  id: optionalString,
  name: optionalString,
  displayName: optionalString,
  email: Schema.optionalWith(Schema.String, { exact: true }),
  photo: Schema.optionalWith(Schema.String, { exact: true }),
  pageFilters: Schema.optionalWith(Schema.Array(PageFilterSchema), { default: () => [] }),
})

const ProjectSummarySchema = Schema.Struct({
  id: optionalString,
  name: optionalString,
  displayName: optionalString,
  publicVisible: optionalBoolean,
  isMember: optionalBoolean,
  usersCount: optionalNumber,
  created: optionalNumber,
  updated: optionalNumber,
})

export const ProjectDetailSchema = Schema.Struct({
  id: optionalString,
  name: optionalString,
  displayName: optionalString,
  uploadImageTo: optionalString,
  uploadFileTo: optionalString,
  gyazoTeamsName: optionalNullableString,
})

const UserRefSchema = Schema.Struct({
  id: optionalString,
  name: Schema.optionalWith(Schema.String, { exact: true }),
  displayName: Schema.optionalWith(Schema.String, { exact: true }),
})

const PageSummarySchema = Schema.Struct({
  id: optionalString,
  title: optionalString,
  image: optionalNullableString,
  descriptions: optionalStrings,
  user: Schema.optionalWith(Schema.NullOr(UserRefSchema), { exact: true }),
  linked: optionalNumber,
  views: optionalNumber,
  linesCount: optionalNumber,
  charsCount: optionalNumber,
  created: optionalNumber,
  updated: optionalNumber,
  accessed: optionalNumber,
  pin: optionalNumber,
})

// 行ごとに、書いた人と日時が付いている。Cosense Web の行の左の印 (テロメア) はこれから描く。
const PageDetailLineSchema = Schema.Struct({
  id: optionalString,
  text: optionalString,
  updated: optionalNumber,
  userId: optionalString,
})

const PageSnapshotEntrySchema = Schema.Struct({
  id: optionalString,
  created: optionalNumber,
})

export const PageSnapshotsResponseSchema = Schema.Struct({
  timestamps: Schema.optionalWith(Schema.Array(PageSnapshotEntrySchema), { default: () => [] }),
})

const SnapshotLineSchema = Schema.Struct({
  id: optionalString,
  text: optionalString,
  created: optionalNumber,
  updated: optionalNumber,
  userId: optionalString,
})

export const PageSnapshotResponseSchema = Schema.Struct({
  snapshot: Schema.Struct({
    title: optionalString,
    created: optionalNumber,
    lines: Schema.optionalWith(Schema.Array(SnapshotLineSchema), { default: () => [] }),
  }),
})

const RelatedPageSchema = Schema.Struct({
  id: optionalString,
  title: optionalString,
  titleLc: optionalString,
  image: optionalNullableString,
  descriptions: optionalStrings,
  linksLc: optionalStrings,
  linked: optionalNumber,
  pageRank: optionalNumber,
  updated: optionalNumber,
  created: optionalNumber,
  accessed: optionalNumber,
  relation: Schema.optionalWith(Schema.Literal("outgoing", "incoming", "bidirectional"), {
    exact: true,
  }),
})

const SearchResultPageSchema = Schema.Struct({
  id: optionalString,
  title: optionalString,
  words: optionalStrings,
  lines: optionalStrings,
  views: optionalNumber,
  linked: optionalNumber,
  updated: optionalNumber,
})

const VectorResultPageSchema = Schema.Struct({
  title: optionalString,
  image: optionalNullableString,
  score: optionalNumber,
  exists: optionalBoolean,
  id: Schema.optionalWith(Schema.String, { exact: true }),
  linked: Schema.optionalWith(Schema.Number, { exact: true }),
})

const TitleEntrySchema = Schema.Struct({
  id: optionalString,
  title: optionalString,
  titleLc: optionalString,
  updated: optionalNumber,
  image: optionalNullableString,
  links: optionalStrings,
})

// ここから下は、エンドポイントごとの包み。公開の型には出さない。

export const ProjectsResponseSchema = Schema.Struct({
  projects: Schema.optionalWith(Schema.Array(ProjectSummarySchema), { default: () => [] }),
})

export const ListPagesResponseSchema = Schema.Struct({
  count: optionalNumber,
  pages: Schema.optionalWith(Schema.Array(PageSummarySchema), { default: () => [] }),
})

// v2 のページの API は、まだ書かれていないタイトルにも 200 と `persistent: false` を返す。
// `title` だけは既定の値を付けない。項目が無いときにだけ、頼んだタイトルで埋めるため
// (明示的な `""` まで頼んだタイトルで上書きしない)。
export const PageV2ResponseSchema = Schema.Struct({
  id: optionalString,
  title: Schema.optionalWith(Schema.String, { exact: true }),
  commitId: optionalString,
  persistent: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  lines: Schema.optionalWith(Schema.Array(PageDetailLineSchema), { default: () => [] }),
  created: optionalNumber,
  updated: optionalNumber,
  accessed: optionalNumber,
  views: optionalNumber,
  linked: optionalNumber,
  linesCount: optionalNumber,
  charsCount: optionalNumber,
  pin: optionalNumber,
  pageRank: optionalNumber,
  snapshotCount: optionalNumber,
  user: Schema.optionalWith(Schema.NullOr(UserRefSchema), { exact: true }),
  lastUpdateUser: Schema.optionalWith(Schema.NullOr(UserRefSchema), { exact: true }),
  users: Schema.optionalWith(Schema.Array(UserRefSchema), { default: () => [] }),
})

// ページの本文は、書いた人を id でしか持たない。名前などはここから引く。
// 抜けたメンバーは `memberSnapshots` に残っている。
export const ProjectUsersResponseSchema = Schema.Struct({
  projectId: optionalString,
  users: Schema.optionalWith(Schema.Array(UserRefSchema), { default: () => [] }),
  memberSnapshots: Schema.optionalWith(
    Schema.Array(Schema.Struct({ data: Schema.optionalWith(UserRefSchema, { exact: true }) })),
    { default: () => [] },
  ),
})

const SynonymsSchema = Schema.optionalWith(Schema.Array(Schema.Array(Schema.String)), {
  default: () => [],
})

const PaginationSchema = Schema.optionalWith(
  Schema.Struct({
    hasNext: optionalBoolean,
    nextId: optionalNullableString,
  }),
  { default: () => ({ hasNext: false, nextId: null }) },
)

export const Links1HopResponseSchema = Schema.Struct({
  links1hop: Schema.optionalWith(Schema.Array(RelatedPageSchema), { default: () => [] }),
  synonyms: SynonymsSchema,
  pagination: PaginationSchema,
})

export const Links2HopResponseSchema = Schema.Struct({
  links2hop: Schema.optionalWith(Schema.Array(RelatedPageSchema), { default: () => [] }),
  hiddenHeadwordsLc: optionalStrings,
  synonyms: SynonymsSchema,
  pagination: PaginationSchema,
})

export const SearchFullTextResponseSchema = Schema.Struct({
  count: optionalNumber,
  existsExactTitleMatch: optionalBoolean,
  pages: Schema.optionalWith(Schema.Array(SearchResultPageSchema), { default: () => [] }),
})

export const SearchVectorResponseSchema = Schema.Struct({
  pages: Schema.optionalWith(Schema.Array(VectorResultPageSchema), { default: () => [] }),
})

// /search/titles は、配列だけか `{ pages: [...] }` のどちらかを返す。どちらかは api.ts が
// 本文の形 (`Array.isArray`) で選ぶ。2 つの Union を読むより、元の値で分けたほうが型を絞りやすい。
export const TitleEntryArraySchema = Schema.Array(TitleEntrySchema)
export const TitleEntryEnvelopeSchema = Schema.Struct({
  pages: Schema.optionalWith(Schema.Array(TitleEntrySchema), { default: () => [] }),
})
