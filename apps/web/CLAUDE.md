# CLAUDE.md

## このプロジェクトは何か

`cosense-toolbox` は、Cosense (旧 Scrapbox) の記法を扱うライブラリ、Astro 統合、エディター連携などを開発するモノレポ。`apps/web` はパッケージのドキュメントサイトとテーマビルダーを提供する Astro アプリ。

もともとは userscript のギャラリーだったが、2026-09-06 に userscript 系を全部落とした（下の「方針」を参照）。

## 方針：トップは「道具の入り口」

トップはドキュメントとテーマビルダーへの入り口。カードの並び順と文言は `src/lib/tools.ts` で管理する。パッケージの説明とガイドは `/docs/` 以下に置き、各ページへの移動はドキュメントのカテゴリナビと検索欄で行う。

**userscript 系は全部削除した（2026-09-06）。** ギャラリー、詳細ページ、使い方ページ、content collection（50本の md）、ソース全文（`src/sources/`）、A層ライブデモ、Gyazo 埋め込み、ツールボックス（カート）、そしてそれらを支えていた Base のモーダル機構まで含む。復活させるなら `5de8ca1` の前を見る。

Starlight は使わず、手書き CSS の Astro サイトとして構成する。ドキュメント本文は `@cosense-toolbox/astro` 統合で `.csnx` から生成する。テーマビルダーは `/builder/` にある。

## 技術スタック / コマンド

- **Astro**（Starlight なし）。Cosense X の Astro 統合を追加し、`.csnx` をページとして扱う。パッケージマネージャは **Bun**（`bun.lock`）
- `bun install` / `bun run dev`（→ localhost:4321）/ `bun run build`（→ `./dist/`）/ `bun run preview`
- スタイルは**手書きCSS**（`src/styles/global.css`）。**Cosense(cosenseの#111ダークテーマ)寄りのパレット**で、ブランドアクセントはインデントドットの星グラデ `#F8E42E→#FF7D54`（`--grad`）

## ページ / コンポーネント構成

- `src/pages/index.astro` … **トップ**。`TOOLS` を `ToolCard` で表示
- `src/pages/**/*.csnx` … ドキュメント本文。見出しは `DocHeading`、リンクは `DocLink` を使い、frontmatter の `toc` と見出し ID を一致させる
- `src/layouts/Base.astro` … 共通レイアウト。**ライトモード切替**と、`[data-copy]` のコピーを 1 つの delegated `<script>` で処理する
- `src/layouts/Doc.astro` / `src/components/DocSidebar.astro` / `DocToc.astro` … ドキュメント用のナビゲーション、本文、ページ内目次
- `src/lib/docs.ts` … サイドバー、検索対象、前後ページの順序を管理する
- `src/lib/site.ts` … サイト定数（いまは GitHub URL だけ）
- `src/lib/tools.ts` … トップに並べる道具の一覧

## 現状

実装済み：

- ドキュメントトップ、各パッケージガイド、テーマビルダー
- **ライトモード**：ヘッダのトグルで切替（`is:inline`で描画前にテーマ確定、localStorage永続）

## テーマビルダー（`/builder`）

Cosenseの色をポチポチ変えて、疑似Cosense画面で即プレビュー → userCSSをコピーする画面。

- Cosenseのテーマは大量の **CSS変数**（`--page-bg` / `--page-text-color` / `--code-bg` / `--navbar-bg` / `--card-bg` …）で定義され、`@media screen{ html[data-project-theme=blue]{…} }` 等にスコープされている（`src/styles/knowledge/index.css` = Cosense本体CSSが資料）
- ビルダーは変数を操作し **`:root{ --x: 値 !important }`** を生成（`!important` で `html[data-project-theme]` の既定を上書き＝member個人ページと同じ手法）
- 操作対象トークンは `src/lib/theme-tokens.ts`（既定値は blue テーマ基準）。`src/pages/builder.astro` が UI＋クライアントロジック（color input → 生成CSSを iframe へ `postMessage`、出力表示、コピー、記事/一覧切替、リセット）
- **プレビューの実体**は `public/builder/` の静的ファイル：`cosense.css`（=index.css）＋ `preview-article.html` / `preview-list.html`（`src/styles/knowledge/` のDOMから個人userCSS/script/linkを除去し、`<html data-project-theme=blue>`＋`<link cosense.css>`＋`<style id="user">`＋postMessageリスナーで包んだもの）
- **これらは生成物**。元(`src/styles/knowledge/`)を変えたら `bun run scripts/build-preview.mjs` で再生成する

## ディレクトリ構成

- `src/pages/` … ルーティング（`.astro` と `.csnx`）
- `src/components/` `src/layouts/` `src/lib/` `src/styles/`
- `public/` … favicon等の静的アセット
