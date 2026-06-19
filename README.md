# Cosense Toolbox

Cosense (旧Scrapbox) のUIをカスタマイズする **userscript / userCSS** を、**好きなものを選んでコピペで使えるギャラリー / ツールボックス**です。テーマ着せ替えから、サイドバー追加・コマンドパレット・地図表示といったアプリ級の改造まで、カテゴリ別に収録しています。

> 気に入ったものをカード（🧰 ツールボックス）に積んで、最後に **import を1つにまとめてコピー** → 自分のCosenseの設定ページに貼るだけ。

## カテゴリ

- **テーマ変更系** — 行番号 / セクション番号 / グリッド線 / カバー画像など見た目の調整
- **便利ツール系** — CMD+Kコマンドパレット / vim風ショートカット / 自動リンク / Markdownコピーなど
- **改造系** — サイドバー / チャット風エディタ / 仮想タブ / Mermaidズームなど大型の改造
- **その他の面白い使い方** — 本文の緯度経度を地図表示する mapfeel、ネイティブアプリ起動など
- **基盤・共通モジュール** — toast / modal / insert-text など他スクリプトから再利用される共通部品

## 開発

[Astro](https://astro.build)（素のAstro / Starlightなし）製。パッケージマネージャは **Bun**。

| コマンド          | 内容                                       |
| :---------------- | :----------------------------------------- |
| `bun install`     | 依存をインストール                         |
| `bun run dev`     | 開発サーバー起動（http://localhost:4321）  |
| `bun run build`   | 本番ビルド（`./dist/` に出力）             |
| `bun run preview` | ビルド結果をローカルでプレビュー           |

### 構成

- `src/content/scripts/*.md` — スクリプト1本 = 1ファイル（カード・詳細ページの元データ）。frontmatter にカテゴリ・ステータス・install スニペット等
- `src/pages/index.astro` — ギャラリー本体（カードグリッド＋フィルタ＋検索）
- `src/pages/s/[...slug].astro` — 各スクリプトの詳細ページ（ライブデモ / コピー）
- `src/components/CosenseCssDemo.astro` — テーマ系の「着せ替えライブデモ」（iframe内の疑似Cosenseページに userCSS をトグル適用）
- `src/layouts/Base.astro` — 共通レイアウト（ツールボックス／テーマ切替／View Transitions）
- `src/styles/global.css` — Cosense寄りのダーク/ライトテーマ

## コントリビュート

OSSです。新しい userscript の提案・改善PR・要望の Discussion を歓迎します。スクリプトを追加するには `src/content/scripts/` に1ファイル足すだけです。
