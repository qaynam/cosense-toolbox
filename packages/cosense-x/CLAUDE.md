# @cosense-toolbox/cosense-x — 開発ルール

このファイルはこのパッケージで作業する全員（人間・AI）が従う規約。
書き方は `packages/parser/CLAUDE.md` に揃えている。迷ったら parser の実装を手本にする。

---

## 0. 大原則

1. **内部では例外を投げない**。失敗しうる処理は `Either` で返し、失敗の値は `errors.ts` の
   `CosenseXError`（`_tag` を持つただのオブジェクト）にする。
   例外にするのは**公開関数の境目だけ**で、`errors.ts` の `orThrow` を通す。
   - 失敗しうる公開関数は、Either を返す内部版（`readPageEither` / `groupComponentsEither` など、
     effect の `decodeUnknownEither` と同じ命名）と、それを `orThrow` で包んだ公開版を並べて置く。
   - パッケージの中では Either 版どうしをつなぐ。公開版をパッケージの中から呼ばない。
   - `compile` は async なので、境目で投げた例外は reject になる。
   - `./fetch` は通信の境目なので、HTTP の失敗は Promise の reject で返す。
2. **無いかもしれない値は、内部では `Option`**。公開 API の境目で `Option.getOrNull` などで
   `null` / `undefined` にする（parser の `asImageSrc` と同じ）。内部版は `componentTagOf` のように
   `〜Of` と名付け、公開版（`parseComponentTag`）と並べる。
3. **種類で分かれるものは `_tag` を付けたユニオンにし、`Match.tag` と `Match.exhaustive` で分ける**
   （行の役割 `BlockRole`、行の途中のタグ `Tag`、リンクの解決結果 `LinkResolution`）。
   Cosense の AST のノード型は `createCompiler` のハンドラ（`to-hast.ts`）か `Match.when({ type })` で分ける。
4. **ファイル I/O をしない**（`./fetch` を除く）。ファイルを読むのは Astro 統合などの利用側。
   `node:path` も使わない。ブラウザや Workers でもコンパイルできるようにするため。
5. **グラフだけを使う人に、JS の生成を持ち込まない**。`./graph` から辿れるモジュール
   （`read` / `metadata` / `links` / `frontmatter` / `components` / `title`）は unified 系・estree 系を import しない。

---

## 1. テスト方針

parser の §1 と同じ。

- **テストを先に書く**。既存の挙動を変えるときも、先にテストを期待する形に書き換えて赤にしてから実装を触る。
- 公開 API の観測可能な挙動（入力テキスト → 出力 HTML / メタデータ / グラフ / エラーの文言）をテストする。
  Either 版や `〜Of` の内部関数に直接テストを書かない。
- `compile` のテストは、生成したモジュールを実際に import して react-dom/server で描画した HTML で確かめる。
- `to-hast.test.ts` は parser の conformance fixture 全件で `toHtml` と出力が一致することを確かめている。
  見た目に関わる変更は、まず `toHtml` と揃っているかを考える。
- スナップショット（`toMatchSnapshot`）は使わない。テスト名は「何が起きるか」を日本語で書く。

---

## 2. 書き方

- effect は named import（`import { Either, Match, Option, pipe } from 'effect'`）。
  **`effect` の `Array` モジュールは使わない**（parser の §4 と同じ理由）。配列は素の `map` / `filter` / `reduce` で扱う。
- class を使わない。トップレベルに可変の状態を置かない（`sideEffects: false` を保つ）。
- 集計は `map` / `flatMap` / `reduce` / `Object.fromEntries` で組み立てる。
  `reduce` の中で累積値を spread し続ける書き方は biome が止めるので、再帰か `Object.fromEntries` にする。
- 状態を持って畳む処理（コンポーネントの開始タグと閉じタグの対応）は、読み取り専用の状態を返す
  `step` を `reduce` で畳む。途中で失敗しうるなら `Either` の中で畳む。
- 次のものは、関数の中に閉じた `let` とループでよい。
  - 文字を 1 つずつ走査する処理（`endOfBraces` / `endOfTag` / `scanTags`）。parser の `findClosingBracket` と同じ扱いで、結果は `Option` で返す
  - estree をその場で書き換える処理（`compile.ts` の `routeThroughComponents`）。後段の `buildJsx` もその場で書き換えるため
  - `toHast` がリンクや警告を 1 つずつ知らせてくるのを受け取る配列（`compile.ts` の `prepare`）。受け取ったら値にして返す
- 公開 API のシグネチャに effect の型を出さない。確認:

  ```sh
  bun run build && grep -nE "Option\.|Either\.|Effect\.|Match\." dist/*.d.mts   # 何も出なければよい
  ```

- コメントは「なぜそうなっているか」を書く。Cosense や MDX の挙動に合わせた結果、直感に反している箇所は必ず理由を残す。

---

## 3. リリース前チェック

```sh
bun run typecheck
bun run test
bun run build
bunx biome check src *.ts
```

加えて §2 の effect 漏れ検証と、`examples/astro-blog` の `astro build` が通ること。
