# CLAUDE.md

## このプロジェクトは何か

`cosense-toolbox` は、cosense (member) が育ててきた **Cosense (旧Scrapbox) の userscript 群を OSS のツールボックスとして配布する**プロジェクト。配布形態は **Astro + Starlight のドキュメントサイト**で、各スクリプトの説明に加えて**ライブデモ**を載せることを狙う。

## 元ネタ（source of truth）

userscript の実体は Cosense の **`cosense-toolbox`** プロジェクト（友達と共同運用）にある。このリポジトリはまだコードを取り込んでおらず、配布用ドキュメントサイトの段階。

- 全スクリプトの起点は **`member` ページ**（ユーザー名＝設定ページ）。ここが約 **35 本**のスクリプト/モジュールを `import "/api/code/cosense-toolbox/<ページ名>/script.js"` で読み込む巨大ローダーになっている
- 失敗を握りつぶす自作 `dynamicImportSafely()` でロードし、`custom.js` を `window.focus` 毎に再注入して SPA 遷移に対応
- **元コードの読み方**: `cosense` CLI を使う。例 → `cosense browsePage 'https://scrapbox.io/cosense-toolbox/<ページタイトル>'`（日本語/記号タイトルはシングルクォート必須）

## スクリプトの分類（配布カテゴリ）

「テーマ変更系 / 便利ツール系 / 改造系 / その他の面白い使い方」の4つ＋**基盤・共通モジュール**で整理する。

- **テーマ変更系**: 行番号CSS、セクション番号CSS、タイトル装飾、トップ画面グリッド線、プロジェクトリストにアイコン、cosense-page-cover-image、（無効: 桜CSS）
- **便利ツール系**: cosense-command(CMD+Kパレット)、vim風キーボードショートカット集、選択文字を囲む、todo、Markdownリンクコピー、1hop/2hopリンクコピー、検索窓→新規作成、選択して自動リンク、読了時間表示、ページをMarkdownに変換、infobox操作2種、link-emebed-on-SP、ページをhomeにピン留め、（無効: icon検索）
- **改造系（各々が大作）**: cosense-sidebar(左固定サイドバー)、cosense-chatlike-editor(モバイルチャット風編集)、cosenseのリンクをiframe内で開く(仮想タブ/画面分割)、cosense-mermaid-viewer、code-blockのMarkdownプレビュー、tableをmodal表示、zenmode
- **その他の面白い使い方**: cosense-mapfeel(本文の緯度経度を地図表示)、cosense-mobile-clientをスキーム起動、command paletteのプリセット(Spotify等)
- **基盤・共通モジュール（OSS化で要切り出し）**: alpine-js-for-user-script-esm、toast、modal-for-userscript、insert-text、cosense-keyboard-events、scroll-cursor-line-to-center、cosense-prettier

## ライブデモ戦略（設計上の最重要制約）

**壁**: cosense の userscript は Cosense ランタイム前提（CSP / `scrapbox`・`cosense` グローバル / `.line`・`.page`・`.navbar` DOM / 内部API `/api/...` / `#text-input`）で動く。素のWebに置いても動かないものが大半で、cosenseページを iframe 埋め込みしても訪問者には改造後の画面は見えない。

→ スクリプトの性質ごとに **3層**でデモを用意する：

- **A層（本物のライブデモ）**: テーマ変更系。**偽のCosense DOM のモック markup** を1枚用意し userCSS をトグル適用する着せ替えデモ。ROIが最も高く、トップの掴みに使う
- **B層（API/DOMをスタブして半ライブ）**: 自己完結UI部品（toast / modal / command palette / mermaid viewer）。Astro アイランドで実物コードをマウントし `fetch`/`cosense.*` をモックに差し替え。**スクリプトが Alpine.js なので `@astrojs/alpinejs`（未導入・要追加）で実物を流用できる**のが Astro を選ぶ最大の利点
- **C層（録画）**: ランタイム密結合（sidebar / chatlike-editor / iframe仮想タブ / mapfeel / キーボードショートカット）。GIF/動画（Gyazo素材）

## OSS化のための移植メモ（gotcha）

- `cosense-toolbox` という**プロジェクト名がハードコード**（import文・API呼び出し）→ 設定変数化が必要
- `member` という**ユーザー名依存**（桜CSS等）
- **Gyazo等の外部画像URLの永続性**が課題
- Alpine.js は「手書きを楽にするための土台」で、cosense では必須ではない

## 方針：ドキュメントではなく「ギャラリー」

当初Starlightでドキュメントサイトを作ったが、**読み物すぎて選びにくい**という判断で、**素のAstroのギャラリー（ショーケース）に作り替えた**。狙いは「気に入ったものを選んで**コピペで自分のCosenseに貼る**」体験（shadcn/ui のレジストリや vimawesome に近いバフェ型）。**Starlightは撤去済み**。

## 技術スタック / コマンド

- **素の Astro**（Starlightなし）、パッケージマネージャは **Bun**（`bun.lock`）
- `bun install` / `bun run dev`（→ localhost:4321）/ `bun run build`（→ `./dist/`）/ `bun run preview`
- スタイルは**手書きCSS**（`src/styles/global.css`）。**Cosense(cosenseの#111ダークテーマ)寄りのパレット**で、ブランドアクセントはインデントドットの星グラデ `#F8E42E→#FF7D54`（`--grad`）
- **未導入で追加候補**: `@astrojs/alpinejs`（B層デモ＝Alpine製スクリプトの実物マウント用）

## データモデル（重要）

各スクリプト = **content collection の1 Markdownファイル**。`src/content/scripts/<asciiスラッグ>.md`（全50本）。スキーマは `src/content.config.ts`。frontmatter:
`title / category(theme|tools-editor|tools-page|mods|fun|core) / tags / status(active|disabled|experimental) / summary / install{kind(js|css|module), code} / demoTier(A|B|C) / source / media? / featured / order`。本文は簡潔な説明（詳細ページに出る）。

## ページ / コンポーネント構成

- `src/pages/index.astro` … **ギャラリー本体**。カードグリッド＋カテゴリフィルタ（すべて/テーマ/ツール/改造/飛び道具/基盤）＋検索。フィルタ/検索は素のJS
- `src/pages/s/[...slug].astro` … 各スクリプトの**詳細ページ**。install snippetのコピー＋デモ枠＋本文＋ソースリンク
- `src/pages/guide.astro` … 1行インストール解説（旧 how-it-works を移植）
- `src/components/ScriptCard.astro` … カード（コピーボタン付き）
- `src/components/CosenseCssDemo.astro` … **A層ライブデモ**。iframe(`srcdoc`/`sandbox`)に疑似Cosenseページ(#111ダーク)を描画し、トグルでuserCSSを適用/解除（`postMessage`でiframe内の`<style>`を有効化）
- `src/lib/categories.ts` … カテゴリ/グループ/ステータスのラベル・色
- `src/lib/demos.ts` … A層デモ用のuserCSS（プレビュー幅でも効くよう`@media`を外した版）。現状 line-numbers / section-numbers / code-block-line-numbers / indent-rainbow の4つ
- `src/layouts/Base.astro` … 共通レイアウト。**ライトモード切替 / ツールボックス（カート）ドロワー / モーダル制御 / ライブデモのトグル**を内蔵。全スクリプトの install 情報を JSON レジストリ(`#tb-registry`)として注入し、**1つの delegated `<script>`** で copy / cart / theme / modal / demo-toggle をまとめて処理。委譲なので、後から `#modal-root` に差し込んだDOMでも全部効く
- **モーダルは自前のSPAオーバーレイ**（`ClientRouter`/View Transitions は撤去）。理由：カードを開いたときに**背景のギャラリーをそのまま残す**ため。カードの `.card-link` クリックを横取り→ `fetch(href)` で詳細HTMLを取り `[data-modal-scrim]` だけ `#modal-root` に差し込む。`history.pushState` でURLは `/s/<slug>/` に、× / 背景 / Esc / 戻る で閉じる（`popstate` で前進/復元）。直リンク時は `/s/<slug>/` がSSRでそのままモーダル表示（閉じる＝ `/` へ遷移）
- `src/lib/site.ts` … サイト定数（GitHub URL、ダミーサムネ画像、localStorageキー）
- `src/pages/s/[...slug].astro` … **Dribbble風モーダルの詳細ページ**。上から 画像 → タイトル → **機能説明(機能ベース。コード/API解説はしない方針)** → **デモ** → インストール(コピー) → **ソース全文アコーディオン**（`<details>` + Astro組み込み `Code`=Shiki, theme github-dark）。背景は dim スクリム、`.modal-dismiss`/×/で `/` に戻る
- **デモの方針**: 詳細ページの「デモ」は **Gyazo oEmbed 埋め込み**（`GyazoEmbed.astro` + `src/lib/gyazo.ts`）。各 `.md` の `demo`(Gyazo画像ページURL) を使い、未指定は `SITE.dummyGyazoDemo`。oEmbedをビルド時に解決し、**`html`(iframe等)が返ればそれを `set:html` で出す**（type=photoのときだけ `<img>`）。ネット不可環境では `i.gyazo.com/<id>.png` にフォールバック（メモ化あり）。**テーマ系4本だけは A層ライブデモ(`CosenseCssDemo`)を優先表示**、他は Gyazo
- **モーダルに差し込むDOMの注意**: `#modal-root` に注入される詳細HTMLは、ギャラリーページに無いスクリプト/スコープCSSは効かない。よって **ライブデモのトグルは Base に集約**、**`.css-demo` 等のスタイルは global.css に置く**（コンポーネントの scoped style/script にしない）。Shikiは inline style、Gyazoは iframe/img なのでそのまま動く
- `src/sources/<slug>.txt` … 各スクリプトの**実ソースコード全文**（cosense-toolbox から `cosense browsePage` で取得、1段デインデントのみで verbatim）。アコーディオン表示用。`import.meta.glob(..., '?raw', eager)` で読む。**44/50 取得済み**（未取得: shortcut-guide=リファレンスでコード無し / search-create-page=実体archive.js / alpine-js・scrapbox-parser・sugar-high=巨大な外部バンドルのため対象外）

## ツールボックス（カート）の仕組み

「気に入ったものを積んで最後に一括コピー」の中核。カード/詳細の `＋ツールボックス`（`data-toolbox-add=<slug>`）で localStorage(`cosense-toolbox-cart`) に slug を出し入れ。ヘッダの 🧰 でドロワーを開き、「まとめてコピー」で **kind ごとに `code:script.js` / `code:style.css` ブロックへ束ねた1枚のスニペット**を生成してクリップボードへ。`buildSnippet()` 参照。

## 現状

`bun run build` で **52ページ**生成OK。実装済み：

- ギャラリー（カード＋フィルタ＋検索）／詳細ページ／使い方ページ
- **ツールボックス（カート）**：積んで一括コピー
- **ライトモード**：ヘッダのトグルで切替（`is:inline`で描画前にテーマ確定、localStorage永続）
- **View Transitions**：カードのサムネ↔詳細heroが `transition:name=thumb-<slug>` でモーフ
- カードのサムネは **ダミー画像**（`SITE.dummyThumb` の Gyazo）。後で各スクリプトのスクショに差し替える想定（`media` フィールドで上書き）
- テーマ系4本にA層ライブデモ。パレットはCosense(#111)寄り＋星グラデ

**注意 / 残タスク**:

- **プロジェクト名は `cosense-toolbox`**。旧称 cosense-toolbox は全置換で消去済み（install path / source URL も `cosense-toolbox`）。**元コードの実体ページがまだCosense上で別名の可能性あり** → CLIで読むときは実プロジェクト名を確認
- 各スクリプトの**スクショ未取得**（全部ダミー画像）。`src/content/scripts/<slug>.md` の `media` に画像URLを入れると差し替わる
- ライブデモ拡充：A層の横展開、B層（`@astrojs/alpinejs`でcosense-command等）、C層（GIF）
- `astro.config.mjs` に `site`（デプロイURL）未設定
- スタブ/無効スクリプト（vim-keybinding等 experimental、link-emebed-on-SP等 disabled）は各 `.md` の status に反映済み

## テーマビルダー（`/builder`）

Cosenseの色をポチポチ変えて、疑似Cosense画面で即プレビュー → userCSSをコピーする画面。

- Cosenseのテーマは大量の **CSS変数**（`--page-bg` / `--page-text-color` / `--code-bg` / `--navbar-bg` / `--card-bg` …）で定義され、`@media screen{ html[data-project-theme=blue]{…} }` 等にスコープされている（`src/styles/knowledge/index.css` = Cosense本体CSSが資料）
- ビルダーは変数を操作し **`:root{ --x: 値 !important }`** を生成（`!important` で `html[data-project-theme]` の既定を上書き＝member個人ページと同じ手法）
- 操作対象トークンは `src/lib/theme-tokens.ts`（既定値は blue テーマ基準）。`src/pages/builder.astro` が UI＋クライアントロジック（color input → 生成CSSを iframe へ `postMessage`、出力表示、コピー、記事/一覧切替、リセット）
- **プレビューの実体**は `public/builder/` の静的ファイル：`cosense.css`（=index.css）＋ `preview-article.html` / `preview-list.html`（`src/styles/knowledge/` のDOMから個人userCSS/script/linkを除去し、`<html data-project-theme=blue>`＋`<link cosense.css>`＋`<style id="user">`＋postMessageリスナーで包んだもの）
- **これらは生成物**。元(`src/styles/knowledge/`)を変えたら `bun run scripts/build-preview.mjs` で再生成する

## ディレクトリ構成

- `src/content/scripts/*.md` … スクリプト1本=1ファイル（カードと詳細ページの元データ）
- `src/pages/` … ルーティング（index / guide / s/[...slug]）
- `src/components/` `src/layouts/` `src/lib/` `src/styles/`
- `public/` … favicon等の静的アセット
