/**
 * types.ts — AST の型定義。このパッケージの単一情報源。
 *
 * NodeMap を type ではなく interface にしているのは、プラグインが declaration merging で
 * ノード型を追加できる余地を残すため (mdast と同じ手法)。
 *
 * すべてのノードは plain object であること。class やメソッドを持たせると
 * `JSON.stringify` / `JSON.parse` で往復できなくなり、worklet や postMessage の
 * 境界を越えられなくなる。
 */

// ---------------------------------------------------------------------------
// 位置情報
// ---------------------------------------------------------------------------

/**
 * ソース上の一点。すべて 0-based (JS の slice とそのまま噛み合わせるため)。
 */
export interface Point {
  /** ページ内の行番号。0 = タイトル行 */
  readonly line: number
  /** 行内の文字オフセット */
  readonly column: number
  /** ページ全文 (parse に渡した文字列) 中の文字オフセット */
  readonly offset: number
}

/**
 * ノードが占めるソース範囲。`end` は exclusive で、
 * `source.slice(start.offset, end.offset)` がそのノードの生の記法テキスト全体
 * (`[`・`#`・バッククォート等のマーカーを含む) と一致する。
 */
export interface Position {
  readonly start: Point
  readonly end: Point
}

/** 位置情報を持つノードの共通形。 */
export interface NodeBase {
  readonly type: string
  readonly position: Position
}

// ---------------------------------------------------------------------------
// インラインノード
// ---------------------------------------------------------------------------

/** 記法として解釈されなかった素のテキスト。 */
export interface TextNode extends NodeBase {
  readonly type: 'text'
  readonly value: string
}

/** `[title]` — 同じプロジェクト内のページへのリンク。 */
export interface InternalLink extends NodeBase {
  readonly type: 'internalLink'
  /** 表示テキスト。内部リンクでは target と同じ */
  readonly label: string
  /** リンク先のページタイトル */
  readonly target: string
}

/** 裸の URL、`[url]`、`[url label]`、`[label url]`。 */
export interface ExternalLink extends NodeBase {
  readonly type: 'externalLink'
  readonly label: string
  readonly target: string
}

/** `[/project/title]` — 別プロジェクトのページへのリンク。 */
export interface ProjectLink extends NodeBase {
  readonly type: 'projectLink'
  readonly label: string
  /** `/project/title` 形式のまま */
  readonly target: string
  readonly project: string
  /** プロジェクト名を除いたページタイトル。`[/project]` のようにタイトルが無ければ空文字 */
  readonly title: string
}

/** `#tag` — 内部リンクと同じくページを指すが、記法が異なるので別ノードにする。 */
export interface Hashtag extends NodeBase {
  readonly type: 'hashtag'
  readonly value: string
}

/** バッククォートで囲んだインラインコード。 */
export interface InlineCode extends NodeBase {
  readonly type: 'inlineCode'
  readonly value: string
}

/** `[url.png]` / `[[url.png]]` (large) / `[linkUrl imageUrl]` (link 付き)。 */
export interface ImageNode extends NodeBase {
  readonly type: 'image'
  readonly src: string
  /** `[[...]]` で囲まれた大きい表示 */
  readonly large?: boolean
  /** 画像をクリックしたときの遷移先 */
  readonly link?: string
}

/** `[user.icon]` / `[user.icon*N]`。 */
export interface IconNode extends NodeBase {
  readonly type: 'icon'
  readonly user: string
  /** 連打の個数 (1..20)。記法上省略されていても 1 が入る */
  readonly count: number
}

/** `[$ 数式]`。中身は解釈せず生のまま返す (KaTeX 等に渡す想定)。 */
export interface FormulaNode extends NodeBase {
  readonly type: 'formula'
  readonly value: string
}

/**
 * `[* text]` `[/ text]` `[- text]` `[_ text]` とその複合、および `[[text]]`。
 *
 * Cosense では 1 つの記法が複数の装飾を同時に持つ (`[-/ text]` は打ち消し かつ 斜体) ため、
 * Markdown のように入れ子の強調へ分解せずフラグの集合として表す。
 */
export interface Decoration extends NodeBase {
  readonly type: 'decoration'
  /** 装飾記号を除いた中身の生テキスト */
  readonly value: string
  readonly bold: boolean
  readonly italic: boolean
  readonly strike: boolean
  readonly underline: boolean
  /** 見出しサイズ段階 0..4 (`[* ]` = 0 〜 `[***** ]` = 4) */
  readonly sizeLevel: number
  /** 装飾内のネスト記法 (リンク・アイコン等)。装飾の入れ子は不可 */
  readonly children: readonly InlineNode[]
}

/**
 * インラインノードの一覧。**このパッケージにおけるインライン記法の単一情報源。**
 * 型を足したら Schema と conformance fixture にも追随させること。
 */
export interface InlineNodeMap {
  text: TextNode
  internalLink: InternalLink
  externalLink: ExternalLink
  projectLink: ProjectLink
  hashtag: Hashtag
  inlineCode: InlineCode
  image: ImageNode
  icon: IconNode
  formula: FormulaNode
  decoration: Decoration
}

export type InlineNodeType = keyof InlineNodeMap
export type InlineNode = InlineNodeMap[InlineNodeType]

// ---------------------------------------------------------------------------
// ブロックノード
// ---------------------------------------------------------------------------

/** ページの 1 行目。`code:` / `table:` として解釈しない (Cosense ではタイトル専用の行)。 */
export interface TitleBlock extends NodeBase {
  readonly type: 'title'
  /** タイトル行の生テキスト。Cosense ではこれがページの識別子でもある */
  readonly value: string
  readonly children: readonly InlineNode[]
}

/** `code:filename` ブロックの本体 1 行。記法は解釈しない。 */
export interface CodeLine extends NodeBase {
  readonly type: 'codeLine'
  /**
   * ブロックの左端に揃えた中身。ヘッダより 1 段深いところを左端とみなすので、
   * それより深いインデントはコード自身の字下げとして残る。
   */
  readonly value: string
}

/** `code:filename` + それより深いインデントの行。 */
export interface CodeBlock extends NodeBase {
  readonly type: 'codeBlock'
  readonly filename: string
  /** ヘッダ行のインデント。本体行はこれより深い */
  readonly indent: number
  /** ヘッダ行自身は含まない */
  readonly lines: readonly CodeLine[]
}

/** テーブルの 1 セル。中身は生テキスト (インライン記法は利用側で必要に応じて解釈する)。 */
export interface TableCell extends NodeBase {
  readonly type: 'tableCell'
  readonly value: string
}

/** テーブルの 1 行。タブ区切りでセルに分割済み。 */
export interface TableRow extends NodeBase {
  readonly type: 'tableRow'
  readonly cells: readonly TableCell[]
}

/** `table:name` + それより深いインデントの行。 */
export interface TableBlock extends NodeBase {
  readonly type: 'table'
  readonly name: string
  readonly indent: number
  readonly rows: readonly TableRow[]
}

/** 通常の行。 */
export interface LineBlock extends NodeBase {
  readonly type: 'line'
  /** 行頭の空白 (半角スペース / タブ / 全角スペース) の文字数 */
  readonly indent: number
  /** `>` で始まる引用行 */
  readonly quote: boolean
  /** 行頭が `$` / `%` の等幅表示行 */
  readonly monospace: boolean
  /** 空行では空配列 */
  readonly children: readonly InlineNode[]
}

/**
 * ブロックノードの一覧。**ブロック構造の単一情報源。**
 * CodeLine / TableRow / TableCell も visitor から辿れるようここに含める。
 */
export interface BlockNodeMap {
  title: TitleBlock
  codeBlock: CodeBlock
  codeLine: CodeLine
  table: TableBlock
  tableRow: TableRow
  tableCell: TableCell
  line: LineBlock
}

export type BlockNodeType = keyof BlockNodeMap
export type BlockNode = BlockNodeMap[BlockNodeType]

/** `Page` の直下に並ぶブロック。 */
export type TopLevelBlock = TitleBlock | CodeBlock | TableBlock | LineBlock

// ---------------------------------------------------------------------------
// ルート
// ---------------------------------------------------------------------------

/** パース結果のルート。 */
export interface Page extends NodeBase {
  readonly type: 'page'
  readonly children: readonly TopLevelBlock[]
}

// ---------------------------------------------------------------------------
// 全ノードの導出型
// ---------------------------------------------------------------------------

export interface RootNodeMap {
  page: Page
}

/** すべてのノード型のマップ。visitor / compiler の handler map はここから導出する。 */
export type AnyNodeMap = RootNodeMap & BlockNodeMap & InlineNodeMap

export type AnyNodeType = keyof AnyNodeMap
export type AnyNode = AnyNodeMap[AnyNodeType]

/** ノード型名からノードの型を引く。`NodeOfType<'image'>` = `ImageNode`。 */
export type NodeOfType<K extends AnyNodeType> = AnyNodeMap[K]

/**
 * `position` を除いたノード本体。
 *
 * 記法を判定する側は「何のノードか」だけを決め、位置の付与は走査側がまとめて行う。
 * こうしておくと、記法を 1 つ足すたびにオフセット計算を書き足さずに済む。
 */
export type WithoutPosition<T> = T extends unknown ? Omit<T, 'position'> : never

/** 位置を持たないインラインノード。記法ルールの戻り値。 */
export type InlineNodeInit = WithoutPosition<InlineNode>
