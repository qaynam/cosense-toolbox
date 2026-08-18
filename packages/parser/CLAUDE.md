# @cosense-toolbox/parser — 開発ルール

このファイルはこのパッケージで作業する全員（人間・AI）が従う規約。
**同じリポジトリの他のパッケージのルールとは独立している。**

このパッケージは `@cosense-toolbox/parser` として npm 公開する。
**そのため他のパッケージに依存せず、常に「自己完結」を保つ。**

---

## 0. 大原則

1. **パースは総関数**。`parse()` 系は例外を投げない・失敗しない。どんな入力でも必ず `Page` を返す。
   不正な記法は「記法として解釈しない（素のテキストになる）」であって、エラーではない。
2. **I/O 禁止**。`fetch` / `fs` / タイマー / グローバル状態を一切使わない。純関数のみ。
   URL の意味解決（YouTube 判定、oEmbed、Gyazo のメディア種別）は**このパッケージのスコープ外**。
3. **自己完結**。ワークスペース内の他パッケージ（`@cosense/*`）を import しない。
   `tsconfig.json` も `extends` せず内容を直接持つ。ディレクトリを別リポにコピーしただけで
   `bun install && bun run build && bun run test` が通る状態を常に維持する。
4. **runtime dependency は `effect` のみ**。他は増やさない。
   （`tsdown` / `vitest` / `typescript` / `fast-check` は devDependencies なので対象外。）

---

## 1. テスト方針（TDD）

### 進め方

**テストを先に書く。** 新しい記法・新しいブロック規則を足すときは、必ず

1. `fixtures/conformance.json` にケースを追加、またはユニットテストを書く（赤を確認する）
2. 実装する
3. 緑になることを確認する

の順。「実装してからテストを後付け」は禁止。既存の挙動を変えるときも、
**先にテストを期待する形に書き換えて赤にしてから**実装を触る。

### 何をテストするか

- **観測可能な挙動のみ**をテストする。すなわち「入力テキスト → AST」「AST → compiler 出力」。
- **内部関数（`bracket-rules/*` の個別 rule、`core/scan.ts` 等）に直接テストを書かない。**
  これらはリファクタで統廃合される可能性があり、テストが実装詳細に癒着すると壊れやすくなる。
  個別 rule の挙動は「その記法を含む入力テキストをパースした結果」として検証する。
  例外: `asImageSrc` のような**単体で公開 API になっている純関数**は直接テストしてよい。

### 壊れにくく書くための規律

- 構造の比較は `stripPositions()` で `position` を落としてから行う。
  位置情報を全ケースに手書きすると、記法を1つ足すたびに無関係なテストが壊れる。
- **位置情報の正しさは別レイヤーで保証する**:
  - 代表ケース（各ノード型 1〜2 件）だけ `at(source, needle)` ヘルパーで厳密一致を書く
  - 網羅的な保証は fast-check のプロパティテスト（§5）に任せる
- **スナップショット一括比較（`toMatchSnapshot`）は禁止。**
  差分レビューが不能になり、「壊れたのか仕様が変わったのか」が判別できなくなる。
  fixture の期待値は JSON として明示的に書く。
- テスト名は「何が起きるか」を日本語で書く。`it('装飾の中のリンクは装飾の子になる')` のように、
  読んだだけで仕様が分かる形にする。

### fixture が仕様の正

`src/fixtures/conformance.json` は `{ description, input, expected }[]` 形式で、
**このパーサーの記法仕様そのもの**として扱う。リリース前にはここが全緑であることが必須条件。
記法の挙動について議論が起きたら、まず fixture を見る。

---

## 2. アーキテクチャルール

### 依存方向（逆流禁止）

```
types.ts   ← 誰にも依存しない（AST の型。NodeMap が単一情報源）
ast.ts     ← types のみ（childrenOf / rawTextOf。AST の「木の形」）
core/      ← types のみ（位置計算・文字列走査のプリミティブ）

core ← inline/ ← block/ ← parse.ts ← index.ts
schema.ts  → types のみ
utils/     → types, ast のみ
compile/   → types, ast のみ
plugin/    → 型だけを再エクスポート（実装を持たない）
```

- `utils/` / `compile/` は**パーサー本体（`parse.ts`、`inline/`、`block/`）を import してはいけない。**
  AST を受け取って処理するだけ。これにより `parse` だけ使う利用者のバンドルに
  compiler や visitor が入らない（§4 tree-shaking）。
- `core/` は記法の知識を持たない（括弧の対応探索、タグ境界の判定、位置計算だけ）。
- ルール（`inline/constructs/`、`inline/bracket-rules/`）から走査ループを直接 import しない。
  再帰が必要なら `InlineContext.tokenize` 経由で呼ぶ（循環 import を避けるため）。
- **循環 import を作らない。** 迷ったら「型は types.ts へ、AST 操作は ast.ts へ、
  記法に依らない小関数は core/ へ」。

### レイヤーの責務

| レイヤー | 責務 | やらないこと |
|---|---|---|
| `core/` | 文字列走査のプリミティブ、Point/Position の生成 | 記法の知識を持たない |
| `inline/` | 1 行の中のインライン記法 → `InlineNode[]` | 複数行のことを知らない |
| `block/` | 行の分類とブロック（code:/table:/title）のグルーピング | インライン記法の中身を知らない（`inline/` に委譲） |
| `parse.ts` | ページ全文 → `Page`。extension の合成 | 記法そのものを実装しない |
| `compile/` | AST → 何らかの出力 | パースしない |
| `utils/` | AST の走査・抽出 | パースしない |

---

## 3. フォルダ構成ルール

```
src/
  index.ts              公開 API バレル。re-export のみ（ロジックを書かない）
  types.ts              AST 型。NodeMap が単一情報源
  ast.ts                childrenOf / rawTextOf（AST の「木の形」の単一情報源）
  schema.ts             effect Schema（./schema サブパス）
  parse.ts              parse / parseLine / createParser
  test-helpers.ts       テスト専用（stripPositions / at）。dist には入らない
  core/
    position.ts         Origin と Point/Position の生成
    scan.ts             括弧の対応探索・タグ境界判定・行頭空白
  inline/
    types.ts            InlineConstruct / BracketRule / InlineContext / Extension（型のみ）
    tokenize.ts         走査ループ。位置の付与はここだけが行う
    constructs/         1 construct = 1 ファイル + index.ts（配列の登録場所）
    bracket-rules/      1 rule = 1 ファイル + index.ts（配列の登録場所）
    image.ts            asImageSrc / imageSrc
  block/
    classify.ts         行の役割判定（タグ付きユニオンを返す）
    build.ts            ブロックのグルーピング
  plugin/index.ts       プラグイン作者向けの型を再エクスポート（実装を持たない）
  compile/
    create-compiler.ts  ハンドラ機構
    to-plain-text.ts    参照実装
  utils/                visit / links
  fixtures/             conformance.json（記法仕様）
```

### ファイル分割の規則

- **1 construct = 1 ファイル、1 bracket rule = 1 ファイル。** 200 行を超えたら分割を検討する。
- ディレクトリの `index.ts` は **re-export と配列の組み立てのみ**。分岐やパースを書かない。
- テストは実装に colocate する（`foo.ts` の隣に `foo.test.ts`）。`__tests__/` ディレクトリは作らない。
- ファイル名は kebab-case（`to-plain-text.ts`）。ディレクトリも kebab-case（`bracket-rules/`）。
- **モジュール内の import は拡張子なし**（`from './core/position'`）。
  ルートリポの `.ts` 拡張子付き import 慣習とは**意図的に違う**。
  このパッケージはバンドルしてから配布するため、bundler 標準の書き方に合わせる。

### 新しい記法を追加する手順（この3点セットを必ず揃える）

1. `inline/constructs/` または `inline/bracket-rules/` に**新しいファイルを1つ**作る
2. 同ディレクトリの `index.ts` の配列に登録する（**登録順 = 優先順位**。既存の順序を動かさない）
3. `fixtures/conformance.json` にケースを追加する（+ 必要なら `types.ts` の NodeMap に型を追加）

既存ファイルを編集して分岐を足すのは避ける。1記法1ファイルを保つ。

---

## 4. tree-shaking ルール

配布物は「`parse` だけ使う人のバンドルに `schema` も `compile` も入らない」状態を保つ。

- `package.json` の `"sideEffects": false` を**壊さない**。すなわち:
  - モジュールのトップレベルで**関数を実行しない**（定数と関数宣言のみ）
  - トップレベルの `let` / 可変オブジェクトを持たない（キャッシュもグローバルに置かない）
  - polyfill や prototype 拡張を書かない
- **class を使わない。** AST は plain object（`JSON.stringify` / `JSON.parse` で往復できること）。
  worklet / postMessage / CLI の `--json` 出力がこの制約に依存している。
- 重い層はサブパス export に分ける（`./schema` `./utils` `./plugin` `./compile`）。
  メインエントリ `index.ts` からは**それらを re-export しない**（したら opt-in の意味が消える）。
- effect は必ず named import（`import { Option } from 'effect'`）。default import / `import * as` は使わない。

---

## 5. 型ポリシー

- **AST の型は `types.ts` の NodeMap（`interface`）が単一情報源。**
  `InlineNodeMap` / `BlockNodeMap` から union・型名・`NodeOfType<K>` を導出する。
  `interface` にしているのは、将来プラグインが declaration merging で
  ノード型を追加できるようにするため（mdast と同じ手法）。**`type` に変えない。**
- ノード型による分岐は**網羅 switch**にし、`default` で `node satisfies never` を書く。
  これにより NodeMap に型を足したとき、対応漏れがコンパイルエラーになる。
- **公開 API のシグネチャに effect を漏らさない。** `parse` / `parseLine` / `tokenizeInline` /
  `utils` / `compile` の引数・戻り値に `Option` / `Either` / `Effect` / `Schema` が
  現れてはいけない。内部で使った `Option<A>` は境界で `Option.getOrNull` 等でアンラップし、
  `A | null` にする（`asImageSrc(): string | null` がその例）。
  検証コマンド（何もヒットしなければ OK）:

  ```sh
  bun run build && grep -nE "Option\.|Either\.|Effect\.|Schema\." dist/index.d.mts dist/utils.d.mts dist/compile.d.mts
  ```

  例外は 2 つだけ:
  - `./schema` — effect ネイティブに使いたい人向けの opt-in サブパス
  - `./plugin` の `InlineConstruct` / `BracketRule` — 記法を書くプラグイン作者は
    `Option` を返す必要がある。`Extension` を経由して `ParseOptions` からも型として参照されるので、
    `dist/index.d.mts` に `effect` からの import 行自体は出る。**シグネチャに出ていなければよい。**
- `import { Array, String, Number } from 'effect'` はグローバルをシャドウする。
  **必ずエイリアスする**（`import { Array as Arr } from 'effect'`）。
- オプション引数は常に「全フィールド optional な readonly object」。
  union 型の引数にしない（フィールド追加が破壊的変更になるため）。
- `exactOptionalPropertyTypes: true` が有効。`{ large?: boolean }` に `undefined` を代入できない。
  「値が無い」はキー自体を省く。

---

## 6. semver / 互換性

| 変更 | バージョン |
|---|---|
| 新しいノード `type` の追加 | minor |
| 既存ノードへの optional フィールド追加 | minor |
| オプション object への optional フィールド追加 | minor |
| 既存ノードのフィールド削除・型変更・必須化 | major |
| `position` の意味論（0-based / end exclusive）の変更 | major |
| ノード `type` 文字列のリネーム | major |

利用者の `switch (node.type)` は minor でのノード型追加に備えて `default` を持つべき、
という注意書きを README に必ず残す。

---

## 7. リリース前チェック

```sh
bun run typecheck   # tsc --noEmit
bun run test        # vitest（fixtures/conformance.json を含めて全緑が必須）
bun run build       # tsdown。ESM は .mjs/.d.mts、CJS は .cjs/.d.cts
bunx biome check src *.ts
```

加えて §5 の effect 漏れ検証と、以下の自己完結チェックを通すこと。

```sh
# ディレクトリを丸ごとコピーしただけで単体ビルド・テストが通るか
cp -R packages/parser /tmp/parser-standalone
cd /tmp/parser-standalone && rm -rf node_modules dist && bun install && bun run build && bun run test
```

tree-shaking の確認（`parse` だけを import したバンドルに schema / compile / utils が入らないこと）:

```sh
# dist/index.mjs から parse だけを import したバンドルに、他の層が入らないこと
echo "import { parse } from './dist/index.mjs'; console.log(parse('x'))" > only-parse.tmp.mjs
bunx esbuild only-parse.tmp.mjs --bundle --format=esm --minify --outfile=/tmp/bundle.js
grep -c "PageSchema\|toPlainText\|collectLinks" /tmp/bundle.js   # → 0
rm only-parse.tmp.mjs
```

## 8. ビルドとコードスタイル

ビルドは **tsdown**（Rolldown ベース）。tsup は 2026 年時点でメンテナンスが止まっており、
tsdown が後継として設定互換を保っている。**tsup に戻さないこと。**

出力の拡張子は ESM が `.mjs` / `.d.mts`、CJS が `.cjs` / `.d.cts`。
`package.json` の `exports` は条件ごとに `types` を持つ形（`import` / `require` の中に
`types` と `default`）にしてある。**エントリを増やすときは
`tsdown.config.ts` の `entry` と `exports` の両方を更新すること。**

リポジトリルートの `biome.json` に従う（single quote / セミコロンなし / 100 桁 / 2 スペース）。
**リポジトリルートの `biome.json` に依存しているので、単体で切り出す際は一緒に持っていくこと。**

コメントは「なぜそうなっているか」を書く。特に**本家 Cosense の挙動に合わせた結果
直感に反している箇所**（装飾内では相対パス画像がリンクになる、`[[...]]` が `]]` でしか閉じない等）は
必ず理由をコメントに残す。何をしているかの逐語訳コメントは書かない。
