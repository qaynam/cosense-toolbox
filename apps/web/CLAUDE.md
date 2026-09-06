# CLAUDE.md

## このプロジェクトは何か

`cosense-toolbox` は、**Cosense (旧Scrapbox) のための道具を配る**プロジェクト。配布形態は素の Astro のサイトで、いまは記法パーサーとテーマビルダーの 2 つを載せている。

もともとは userscript のギャラリーだったが、2026-09-06 に userscript 系を全部落とした（下の「方針」を参照）。

## 方針：トップは「道具の入り口」

トップは**道具をカードで並べる入り口**にしてある（void0 / TanStack のような、ロゴを前に出した中央寄せ）。並び順とラベルの単一情報源は `src/lib/tools.ts`。道具を足したら、ページを作ってからここに登録する。道具どうしの移動はヘッダのナビが担う。

**userscript 系は全部削除した（2026-09-06）。** ギャラリー、詳細ページ、使い方ページ、content collection（50本の md）、ソース全文（`src/sources/`）、A層ライブデモ、Gyazo 埋め込み、ツールボックス（カート）、そしてそれらを支えていた Base のモーダル機構まで含む。復活させるなら `5de8ca1` の前を見る。

いま残っているのは **記法パーサー**（`/parser/`）と**テーマビルダー**（`/builder/`）の 2 つ。**Starlightは撤去済み**。

## 技術スタック / コマンド

- **素の Astro**（Starlightなし）、パッケージマネージャは **Bun**（`bun.lock`）
- `bun install` / `bun run dev`（→ localhost:4321）/ `bun run build`（→ `./dist/`）/ `bun run preview`
- スタイルは**手書きCSS**（`src/styles/global.css`）。**Cosense(cosenseの#111ダークテーマ)寄りのパレット**で、ブランドアクセントはインデントドットの星グラデ `#F8E42E→#FF7D54`（`--grad`）
- **未導入で追加候補**: `@astrojs/alpinejs`（B層デモ＝Alpine製スクリプトの実物マウント用）

## ページ / コンポーネント構成

- `src/pages/index.astro` … **トップ**。`TOOLS` を `ToolCard` でグリッド表示するだけ
- `src/layouts/Base.astro` … 共通レイアウト。**ライトモード切替**と、`[data-copy]` のコピーを 1 つの delegated `<script>` で処理する
- `src/layouts/Doc.astro` / `src/components/DocSidebar.astro` / `DocToc.astro` … パーサーのドキュメント用の 3 カラム
- `src/lib/site.ts` … サイト定数（いまは GitHub URL だけ）
- `src/lib/tools.ts` … トップに並べる道具の一覧

## 現状

`bun run build` で **11ページ**生成OK。実装済み：

- トップの道具一覧／記法パーサーのドキュメント／テーマビルダー
- **ライトモード**：ヘッダのトグルで切替（`is:inline`で描画前にテーマ確定、localStorage永続）

## テーマビルダー（`/builder`）

Cosenseの色をポチポチ変えて、疑似Cosense画面で即プレビュー → userCSSをコピーする画面。

- Cosenseのテーマは大量の **CSS変数**（`--page-bg` / `--page-text-color` / `--code-bg` / `--navbar-bg` / `--card-bg` …）で定義され、`@media screen{ html[data-project-theme=blue]{…} }` 等にスコープされている（`src/styles/knowledge/index.css` = Cosense本体CSSが資料）
- ビルダーは変数を操作し **`:root{ --x: 値 !important }`** を生成（`!important` で `html[data-project-theme]` の既定を上書き＝member個人ページと同じ手法）
- 操作対象トークンは `src/lib/theme-tokens.ts`（既定値は blue テーマ基準）。`src/pages/builder.astro` が UI＋クライアントロジック（color input → 生成CSSを iframe へ `postMessage`、出力表示、コピー、記事/一覧切替、リセット）
- **プレビューの実体**は `public/builder/` の静的ファイル：`cosense.css`（=index.css）＋ `preview-article.html` / `preview-list.html`（`src/styles/knowledge/` のDOMから個人userCSS/script/linkを除去し、`<html data-project-theme=blue>`＋`<link cosense.css>`＋`<style id="user">`＋postMessageリスナーで包んだもの）
- **これらは生成物**。元(`src/styles/knowledge/`)を変えたら `bun run scripts/build-preview.mjs` で再生成する

## ディレクトリ構成

- `src/pages/` … ルーティング（index / builder / parser/*）
- `src/components/` `src/layouts/` `src/lib/` `src/styles/`
- `public/` … favicon等の静的アセット
