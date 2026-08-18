# Cosense Toolbox

Cosense (旧Scrapbox) まわりの道具をまとめたモノレポです。

| パッケージ | 内容 |
| :--- | :--- |
| [`apps/web`](./apps/web) | userscript / userCSS のギャラリーサイト |
| [`packages/parser`](./packages/parser) | Cosense 記法パーサー ([`@cosense-toolbox/parser`](https://www.npmjs.com/package/@cosense-toolbox/parser), beta) |

> Cosense (Scrapbox) の非公式プロジェクトです。開発元である Nota, Inc. とは関係がなく、公認も受けていません。

## ギャラリーサイト (`apps/web`)

Cosense のUIをカスタマイズする **userscript / userCSS** を、**好きなものを選んでコピペで使えるギャラリー**です。テーマ着せ替えから、サイドバー追加・コマンドパレット・地図表示といったアプリ級の改造まで、カテゴリ別に収録しています。

> 気に入ったものをカード（🧰 ツールボックス）に積んで、最後に **import を1つにまとめてコピー** → 自分のCosenseの設定ページに貼るだけ。

### カテゴリ

- **テーマ変更系** — 行番号 / セクション番号 / グリッド線 / カバー画像など見た目の調整
- **便利ツール系** — CMD+Kコマンドパレット / vim風ショートカット / 自動リンク / Markdownコピーなど
- **改造系** — サイドバー / チャット風エディタ / 仮想タブ / Mermaidズームなど大型の改造
- **その他の面白い使い方** — 本文の緯度経度を地図表示する mapfeel、ネイティブアプリ起動など
- **基盤・共通モジュール** — toast / modal / insert-text など他スクリプトから再利用される共通部品

### 構成

- `apps/web/src/content/scripts/*.md` — スクリプト1本 = 1ファイル（カード・詳細ページの元データ）。frontmatter にカテゴリ・ステータス・install スニペット等
- `apps/web/src/pages/index.astro` — ギャラリー本体（カードグリッド＋フィルタ＋検索）
- `apps/web/src/pages/s/[...slug].astro` — 各スクリプトの詳細ページ（ライブデモ / コピー）
- `apps/web/src/components/CosenseCssDemo.astro` — テーマ系の「着せ替えライブデモ」（iframe内の疑似Cosenseページに userCSS をトグル適用）
- `apps/web/src/layouts/Base.astro` — 共通レイアウト（ツールボックス／テーマ切替／View Transitions）
- `apps/web/src/styles/global.css` — Cosense寄りのダーク/ライトテーマ

## 記法パーサー (`packages/parser`)

Cosense 記法を、位置情報つきの unist 風 AST に変換するライブラリです。依存は `effect` のみで、DOM も Node の API も使いません。詳しくは [packages/parser/README.md](./packages/parser/README.md) を参照してください。

```sh
npm i @cosense-toolbox/parser@beta
```

## 開発

[Turborepo](https://turbo.build) + **Bun** のモノレポです。サイトは [Astro](https://astro.build)（素のAstro / Starlightなし）製。

| コマンド | 内容 |
| :--- | :--- |
| `bun install` | 依存をインストール |
| `bun run dev` | 開発サーバー起動（http://localhost:4321） |
| `bun run build` | 全パッケージをビルド |
| `bun run test` | 全パッケージのテスト |
| `bun run typecheck` | 全パッケージの型チェック |
| `bun run lint` | Biome によるチェック |

個別のパッケージだけを動かすときは、そのディレクトリに入って `bun run <script>` を実行してください。

## コントリビュート

OSSです。新しい userscript の提案・改善PR・要望の Discussion を歓迎します。スクリプトを追加するには `apps/web/src/content/scripts/` に1ファイル足すだけです。
