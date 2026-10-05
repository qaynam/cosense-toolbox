# CLAUDE.md

## このプロジェクトは何か

`cosense-toolbox` は、Cosense (旧 Scrapbox) の記法を扱うライブラリ、Astro 統合、エディター連携などを開発するモノレポ。`apps/web` はパッケージのドキュメントサイトとテーマビルダーを提供する Astro アプリ。

もともとは userscript のギャラリーだったが、2026-09-06 に userscript 系を全部落とした（下の「方針」を参照）。

## 方針：トップは「道具の入り口」

トップはパッケージとテーマビルダーへの入り口。種類ごと (ライブラリ・エディター連携・道具) にカードを並べ、並び順と文言は `src/lib/tools.ts` の `TOOL_GROUPS` で管理する。パッケージの説明とガイドは `/docs/` 以下に置き、各ページへの移動はドキュメントのカテゴリナビとヘッダの検索 (⌘K / Ctrl+K) で行う。

**userscript 系は全部削除した（2026-09-06）。** ギャラリー、詳細ページ、使い方ページ、content collection（50本の md）、ソース全文（`src/sources/`）、A層ライブデモ、Gyazo 埋め込み、ツールボックス（カート）、そしてそれらを支えていた Base のモーダル機構まで含む。復活させるなら `5de8ca1` の前を見る。

Starlight は使わず、手書き CSS の Astro サイトとして構成する。ドキュメント本文は `@cosense-toolbox/astro` 統合で `.csnx` から生成する。テーマビルダーは `/builder/` にある。

## 技術スタック / コマンド

- **Astro**（Starlight なし）。Cosense X の Astro 統合を追加し、`.csnx` をページとして扱う。パッケージマネージャは **Bun**（`bun.lock`）
- 検索は **Pagefind**。`bun run build` が `astro build` の後に `pagefind --site dist` で索引を作る。索引が無い開発中は、`src/lib/docs.ts` のページ一覧から探す
- `bun install` / `bun run dev`（→ localhost:4321）/ `bun run build`（→ `./dist/` と検索の索引）/ `bun run preview`
- スタイルは**手書きCSS**（`src/styles/global.css`）。**Cosense(cosenseの#111ダークテーマ)寄りのパレット**で、ブランドアクセントはインデントドットの星グラデ `#F8E42E→#FF7D54`
- コードの色は shiki の 2 つのテーマ (`github-light-default` / `github-dark-default`) を CSS 変数で出し、サイトのテーマに合わせて選ぶ (`astro.config.mjs`)。`.csn` / `.csnx` の例は `@cosense-toolbox/textmate` の文法で色付けする
- 文字と背景のコントラストは、ライト・ダークとも WCAG AA (4.5:1) を保つ

## ページ / コンポーネント構成

- `src/pages/index.astro` … **トップ**。`TOOL_GROUPS` を種類ごとに `ToolCard` で表示
- `src/pages/**/*.csnx` … ドキュメント本文。見出しは `DocHeading` を使い、frontmatter の `toc` と見出し ID を一致させる
  - ページへのリンクは Cosense の `[ページのタイトル]` で書く。タイトルは各ページの 1 行目で、frontmatter の `title` も同じにする。書き間違えたリンクは `lint` でビルドが止まる
  - 外部のリンクは `[ラベル https://…]`。`.csnx` でないページ (`/parser/demo/`) やページ内の見出しへのリンクだけ `DocLink` を使う
  - `code:` のブロックの中の空行も、ブロックの字下げ (空白) を付ける。字下げの無い空行でブロックが終わるため
- `src/lib/code-language.ts` … コードブロックの見出しに言語のアイコン (Material Icon Theme) と名前を出す描画の拡張。Cosense 記法のブロックは `public/icons/cosense.svg`
- `src/components/SiteSearch.astro` … ヘッダの検索ボタンと、⌘K / Ctrl+K で開く検索のダイアログ
- `src/layouts/Base.astro` … 共通レイアウト。**ライトモード切替**と、`[data-copy]` のコピーを 1 つの delegated `<script>` で処理する
- `src/layouts/Doc.astro` / `src/components/DocSidebar.astro` / `DocToc.astro` … ドキュメント用のナビゲーション、本文、ページ内目次
- `src/lib/docs.ts` … サイドバー、検索対象、前後ページの順序を管理する
- `src/lib/site.ts` … サイト定数（いまは GitHub URL だけ）
- `src/lib/tools.ts` … トップに並べる道具の一覧

## 現状

実装済み：

- ドキュメントトップ、各パッケージガイド、テーマビルダー、アイコン作成
- **ライトモード**：ヘッダのトグルで切替（`is:inline`で描画前にテーマ確定、localStorage永続）

## テーマビルダー（`/builder`）

Cosenseの色をポチポチ変えて、疑似Cosense画面で即プレビュー → userCSSをコピーする画面。

- Cosenseのテーマは大量の **CSS変数**（`--page-bg` / `--page-text-color` / `--code-bg` / `--navbar-bg` / `--card-bg` …）で定義され、`@media screen{ html[data-project-theme=blue]{…} }` 等にスコープされている（`src/styles/knowledge/index.css` = Cosense本体CSSが資料）
- ビルダーは変数を操作し **`:root{ --x: 値 !important }`** を生成（`!important` で `html[data-project-theme]` の既定を上書き＝member個人ページと同じ手法）
- 操作対象トークンは `src/lib/theme-tokens.ts`（既定値は blue テーマ基準）。`src/pages/builder.astro` が UI＋クライアントロジック（color input → 生成CSSを iframe へ `postMessage`、出力表示、コピー、記事/一覧切替、リセット）
- **プレビューの実体**は `public/builder/` の静的ファイル：`cosense.css`（=index.css）＋ `preview-article.html` / `preview-list.html`（`src/styles/knowledge/` のDOMから個人userCSS/script/linkを除去し、`<html data-project-theme=blue>`＋`<link cosense.css>`＋`<style id="user">`＋postMessageリスナーで包んだもの）
- **これらは生成物**。元(`src/styles/knowledge/`)を変えたら `bun run scripts/build-preview.mjs` で再生成する

## アイコン作成（`/icon`）

文字と記号でバッジを作り、Cosense のアイコン記法 (`[名前.icon]`) に使う PNG を書き出す画面。自由度はわざと絞っている（ひな形・文字・記号・形・2 色・斜体だけ）。

- 大きさと位置の計算は `src/lib/badge.ts`（純粋な関数、`badge.test.ts` でテスト）。高さは 128px に固定し、横にだけ伸ばす
- canvas に描くのは `src/lib/badge-canvas.ts`。斜体は字体に頼らず座標を傾けて描く（日本語の字体は斜体を持たないことが多い）
- プレビューは `@cosense-toolbox/style` の `.page img.icon` で、Cosense の行の中と同じ大きさに出す
- 作らずに済む場合のために、公開アイコンの `/icons` プロジェクト (`[/icons/check.icon]`) を案内している

## ディレクトリ構成

- `src/pages/` … ルーティング（`.astro` と `.csnx`）
- `src/components/` `src/layouts/` `src/lib/` `src/styles/`
- `public/` … favicon等の静的アセット
